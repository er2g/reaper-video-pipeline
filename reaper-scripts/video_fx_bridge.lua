-- Video FX Bridge for REAPER
-- Bu script Electron uygulaması ile iletişim kurar
-- Komut dosyasını poll eder ve işlemleri gerçekleştirir

local COMM_DIR = os.getenv("TEMP") .. "\\reaper-video-fx"
local COMMAND_FILE = COMM_DIR .. "\\command.json"
local RESPONSE_FILE = COMM_DIR .. "\\response.json"
local POLL_INTERVAL = 0.1 -- 100ms

-- JSON Parser (basit implementasyon)
local function parse_json(str)
    -- Basit JSON parser
    local result = {}

    -- command alanını çıkar
    local cmd = str:match('"command"%s*:%s*"([^"]*)"')
    if cmd then result.command = cmd end

    -- data alanını çıkar (string olarak)
    local data = str:match('"data"%s*:%s*"([^"]*)"')
    if data then result.data = data end

    -- trackIndex alanını çıkar (number olarak)
    local trackIdx = str:match('"trackIndex"%s*:%s*(%d+)')
    if trackIdx then result.trackIndex = tonumber(trackIdx) end

    -- audioPath alanını çıkar
    local audioPath = str:match('"audioPath"%s*:%s*"([^"]*)"')
    if audioPath then
        result.audioPath = audioPath:gsub("\\\\", "\\")
    end

    -- outputPath alanını çıkar
    local outputPath = str:match('"outputPath"%s*:%s*"([^"]*)"')
    if outputPath then
        result.outputPath = outputPath:gsub("\\\\", "\\")
    end

    return result
end

local function to_json(tbl)
    local parts = {}
    for k, v in pairs(tbl) do
        local val
        if type(v) == "string" then
            val = '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n') .. '"'
        elseif type(v) == "table" then
            -- Array of tracks
            local items = {}
            for i, item in ipairs(v) do
                if type(item) == "table" then
                    local subparts = {}
                    for sk, sv in pairs(item) do
                        if type(sv) == "string" then
                            table.insert(subparts, '"' .. sk .. '":"' .. sv:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"')
                        else
                            table.insert(subparts, '"' .. sk .. '":' .. tostring(sv))
                        end
                    end
                    table.insert(items, '{' .. table.concat(subparts, ',') .. '}')
                end
            end
            val = '[' .. table.concat(items, ',') .. ']'
        elseif type(v) == "boolean" then
            val = v and "true" or "false"
        else
            val = tostring(v)
        end
        table.insert(parts, '"' .. k .. '":' .. val)
    end
    return '{' .. table.concat(parts, ',') .. '}'
end

local function file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

local function read_file(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local content = f:read("*all")
    f:close()
    return content
end

local function write_file(path, content)
    local f = io.open(path, "w")
    if not f then return false end
    f:write(content)
    f:close()
    return true
end

local function delete_file(path)
    os.remove(path)
end

local function ensure_dir()
    os.execute('mkdir "' .. COMM_DIR .. '" 2>nul')
end

-- REAPER Fonksiyonları

local function get_tracks()
    local tracks = {}
    local count = reaper.CountTracks(0)
    for i = 0, count - 1 do
        local track = reaper.GetTrack(0, i)
        local _, name = reaper.GetTrackName(track)
        if name == "" then name = "Track " .. (i + 1) end
        table.insert(tracks, {
            index = i,
            name = name
        })
    end
    return tracks
end

local function load_audio_to_track(track_index, audio_path)
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return false, "Track bulunamadı"
    end

    -- Mevcut item'ları temizle (opsiyonel - track'in başına ekle)
    -- Track'i seç
    reaper.SetOnlyTrackSelected(track)

    -- Cursor'ı başa al
    reaper.SetEditCurPos(0, false, false)

    -- Ses dosyasını ekle
    local item_count_before = reaper.CountTrackMediaItems(track)
    reaper.InsertMedia(audio_path, 0) -- 0 = current track
    local item_count_after = reaper.CountTrackMediaItems(track)

    if item_count_after > item_count_before then
        return true, "Ses yüklendi"
    else
        return false, "Ses yüklenemedi"
    end
end

local function render_track(track_index, output_path)
    local track = reaper.GetTrack(0, track_index)
    if not track then
        return false, "Track bulunamadı"
    end

    -- Tüm track'leri mute et, sadece hedef track'i aç
    local track_count = reaper.CountTracks(0)
    local original_mutes = {}

    for i = 0, track_count - 1 do
        local t = reaper.GetTrack(0, i)
        original_mutes[i] = reaper.GetMediaTrackInfo_Value(t, "B_MUTE")
        if i ~= track_index then
            reaper.SetMediaTrackInfo_Value(t, "B_MUTE", 1)
        else
            reaper.SetMediaTrackInfo_Value(t, "B_MUTE", 0)
        end
    end

    -- Track'teki item'ların süresini bul
    local item_count = reaper.CountTrackMediaItems(track)
    local max_end = 0
    for i = 0, item_count - 1 do
        local item = reaper.GetTrackMediaItem(track, i)
        local item_start = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
        local item_len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
        local item_end = item_start + item_len
        if item_end > max_end then max_end = item_end end
    end

    if max_end == 0 then
        -- Mute'ları geri al
        for i = 0, track_count - 1 do
            local t = reaper.GetTrack(0, i)
            reaper.SetMediaTrackInfo_Value(t, "B_MUTE", original_mutes[i])
        end
        return false, "Track'te ses bulunamadı"
    end

    -- Time selection ayarla
    reaper.GetSet_LoopTimeRange(true, false, 0, max_end, false)

    -- Render settings
    -- Output format: WAV
    local render_cfg = ""

    -- Geçici render ayarlarını kaydet
    local orig_render_file = reaper.GetSetProjectInfo_String(0, "RENDER_FILE", "", false)
    local orig_render_pattern = reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "", false)

    -- Output path'i ayıkla
    local dir = output_path:match("(.+)\\[^\\]+$") or ""
    local filename = output_path:match("([^\\]+)$") or "output.wav"
    filename = filename:gsub("%.wav$", "")

    reaper.GetSetProjectInfo_String(0, "RENDER_FILE", dir, true)
    reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", filename, true)

    -- Bounds: Time selection
    reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 2, true)

    -- Source: Master mix
    reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true)

    -- Render
    local result = reaper.Main_OnCommand(42230, 0) -- Render project using last settings

    -- Ayarları geri al
    reaper.GetSetProjectInfo_String(0, "RENDER_FILE", orig_render_file, true)
    reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", orig_render_pattern, true)

    -- Mute'ları geri al
    for i = 0, track_count - 1 do
        local t = reaper.GetTrack(0, i)
        reaper.SetMediaTrackInfo_Value(t, "B_MUTE", original_mutes[i])
    end

    -- Time selection'ı temizle
    reaper.GetSet_LoopTimeRange(true, false, 0, 0, false)

    return true, output_path
end

local function process_command(cmd_data)
    local command = cmd_data.command

    if command == "GET_TRACKS" then
        local tracks = get_tracks()
        return {
            success = true,
            tracks = tracks
        }

    elseif command == "LOAD_AUDIO" then
        local success, msg = load_audio_to_track(cmd_data.trackIndex, cmd_data.audioPath)
        return {
            success = success,
            message = msg
        }

    elseif command == "RENDER_TRACK" then
        local success, msg = render_track(cmd_data.trackIndex, cmd_data.outputPath)
        return {
            success = success,
            message = msg,
            outputPath = cmd_data.outputPath
        }

    elseif command == "PING" then
        return {
            success = true,
            message = "pong"
        }

    elseif command == "CLEAR_TRACK" then
        local track = reaper.GetTrack(0, cmd_data.trackIndex)
        if track then
            -- Track'teki tüm item'ları sil
            while reaper.CountTrackMediaItems(track) > 0 do
                local item = reaper.GetTrackMediaItem(track, 0)
                reaper.DeleteTrackMediaItem(track, item)
            end
            return { success = true, message = "Track temizlendi" }
        end
        return { success = false, message = "Track bulunamadı" }

    else
        return {
            success = false,
            message = "Bilinmeyen komut: " .. (command or "nil")
        }
    end
end

-- Ana poll fonksiyonu
local function poll()
    if file_exists(COMMAND_FILE) then
        local content = read_file(COMMAND_FILE)
        if content and content ~= "" then
            -- Komutu işle
            local cmd_data = parse_json(content)
            local response = process_command(cmd_data)

            -- Yanıtı yaz
            write_file(RESPONSE_FILE, to_json(response))

            -- Komut dosyasını sil
            delete_file(COMMAND_FILE)
        end
    end

    reaper.defer(poll)
end

-- Başlat
ensure_dir()
reaper.ShowConsoleMsg("Video FX Bridge başlatıldı\n")
reaper.ShowConsoleMsg("İletişim dizini: " .. COMM_DIR .. "\n")
poll()
