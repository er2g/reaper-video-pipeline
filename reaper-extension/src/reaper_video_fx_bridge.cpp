#ifdef _WIN32
#include <windows.h>
#endif

#include <filesystem>
#include <fstream>
#include <optional>
#include <sstream>
#include <cstdlib>
#include <string>
#include <vector>

#ifndef WDL_INT64
using WDL_INT64 = __int64;
#endif
#ifndef WDL_UINT64
using WDL_UINT64 = unsigned __int64;
#endif

#define REAPERAPI_IMPLEMENT
#define REAPERAPI_MINIMAL
#define REAPERAPI_WANT_CountTracks
#define REAPERAPI_WANT_GetTrack
#define REAPERAPI_WANT_GetTrackName
#define REAPERAPI_WANT_SetOnlyTrackSelected
#define REAPERAPI_WANT_SetEditCurPos
#define REAPERAPI_WANT_CountTrackMediaItems
#define REAPERAPI_WANT_InsertMedia
#define REAPERAPI_WANT_GetTrackMediaItem
#define REAPERAPI_WANT_GetMediaItemInfo_Value
#define REAPERAPI_WANT_GetMediaTrackInfo_Value
#define REAPERAPI_WANT_SetMediaTrackInfo_Value
#define REAPERAPI_WANT_GetSet_LoopTimeRange
#define REAPERAPI_WANT_GetSetProjectInfo_String
#define REAPERAPI_WANT_GetSetProjectInfo
#define REAPERAPI_WANT_Main_OnCommand
#define REAPERAPI_WANT_DeleteTrackMediaItem
#define REAPER_PLUGIN_FUNCTIONS_IMPL_LOADFUNC
#include "reaper_plugin.h"
using Reaproject = ReaProject; // SDK header typo workaround (StartPreviewFade signature)
#include "reaper_plugin_functions.h"

namespace
{
reaper_plugin_info_t* g_rec = nullptr;
std::filesystem::path g_commDir;
std::filesystem::path g_commandFile;
std::filesystem::path g_responseFile;
bool g_processing = false;

std::filesystem::path GetTempDir()
{
#ifdef _WIN32
  char buf[MAX_PATH + 2]{};
  const DWORD len = GetTempPathA(static_cast<DWORD>(sizeof(buf)), buf);
  if (len > 0 && len < sizeof(buf))
    return std::filesystem::path(buf);
#endif
  const char* envTmp = std::getenv("TEMP");
  if (envTmp && *envTmp)
    return std::filesystem::path(envTmp);
  return std::filesystem::current_path();
}

void EnsureCommPaths()
{
  g_commDir = GetTempDir() / "reaper-video-fx";
  g_commandFile = g_commDir / "command.json";
  g_responseFile = g_commDir / "response.json";
  std::error_code ec;
  std::filesystem::create_directories(g_commDir, ec);
}

std::optional<std::string> ReadFile(const std::filesystem::path& path)
{
  std::ifstream in(path, std::ios::binary);
  if (!in)
    return std::nullopt;
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

bool WriteFileAtomic(const std::filesystem::path& path, const std::string& content)
{
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);

  const auto tmpPath = path.string() + ".tmp";
  {
    std::ofstream out(tmpPath, std::ios::binary | std::ios::trunc);
    if (!out)
      return false;
    out.write(content.data(), static_cast<std::streamsize>(content.size()));
    out.flush();
    if (!out)
      return false;
  }

#ifdef _WIN32
  if (!MoveFileExA(tmpPath.c_str(), path.string().c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
  {
    std::filesystem::remove(tmpPath, ec);
    return false;
  }
  return true;
#else
  std::filesystem::rename(tmpPath, path, ec);
  if (ec)
  {
    std::filesystem::remove(tmpPath, ec);
    return false;
  }
  return true;
#endif
}

void TryDeleteFile(const std::filesystem::path& path)
{
  std::error_code ec;
  std::filesystem::remove(path, ec);
}

std::optional<std::string> JsonGetString(const std::string& json, const char* key)
{
  const std::string needle = std::string("\"") + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos)
    return std::nullopt;
  pos = json.find(':', pos + needle.size());
  if (pos == std::string::npos)
    return std::nullopt;
  pos = json.find('"', pos);
  if (pos == std::string::npos)
    return std::nullopt;
  const size_t end = json.find('"', pos + 1);
  if (end == std::string::npos)
    return std::nullopt;
  return json.substr(pos + 1, end - (pos + 1));
}

std::optional<int> JsonGetInt(const std::string& json, const char* key)
{
  const std::string needle = std::string("\"") + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos)
    return std::nullopt;
  pos = json.find(':', pos + needle.size());
  if (pos == std::string::npos)
    return std::nullopt;
  pos++;
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\r' || json[pos] == '\n'))
    pos++;
  size_t end = pos;
  while (end < json.size() && (json[end] == '-' || (json[end] >= '0' && json[end] <= '9')))
    end++;
  if (end == pos)
    return std::nullopt;
  try
  {
    return std::stoi(json.substr(pos, end - pos));
  }
  catch (...)
  {
    return std::nullopt;
  }
}

std::string JsonEscape(const std::string& s)
{
  std::string out;
  out.reserve(s.size() + 16);
  for (const char c : s)
  {
    switch (c)
    {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: out += c; break;
    }
  }
  return out;
}

std::string JsonUnescapeSimple(const std::string& s)
{
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++)
  {
    const char c = s[i];
    if (c != '\\' || i + 1 >= s.size())
    {
      out += c;
      continue;
    }

    const char n = s[i + 1];
    switch (n)
    {
      case '\\': out += '\\'; i++; break;
      case '"': out += '"'; i++; break;
      case 'n': out += '\n'; i++; break;
      case 'r': out += '\r'; i++; break;
      case 't': out += '\t'; i++; break;
      case '/': out += '/'; i++; break;
      default:
        out += c;
        break;
    }
  }
  return out;
}

std::string MakeError(const std::string& msg)
{
  return std::string("{\"success\":false,\"message\":\"") + JsonEscape(msg) + "\"}";
}

std::string MakeOk(const std::string& msg)
{
  return std::string("{\"success\":true,\"message\":\"") + JsonEscape(msg) + "\"}";
}

std::string MakeTracks()
{
  const int trackCount = CountTracks(nullptr);
  std::string json = "{\"success\":true,\"tracks\":[";
  bool first = true;
  for (int i = 0; i < trackCount; i++)
  {
    MediaTrack* track = GetTrack(nullptr, i);
    char nameBuf[512]{};
    bool haveName = false;
    if (track)
      haveName = GetTrackName(track, nameBuf, static_cast<int>(sizeof(nameBuf)));
    std::string name = (haveName && nameBuf[0]) ? nameBuf : ("Track " + std::to_string(i + 1));

    if (!first)
      json += ",";
    first = false;
    json += "{\"index\":";
    json += std::to_string(i);
    json += ",\"name\":\"";
    json += JsonEscape(name);
    json += "\"}";
  }
  json += "]}";
  return json;
}

std::string CmdLoadAudio(int trackIndex, const std::string& audioPath)
{
  MediaTrack* track = GetTrack(nullptr, trackIndex);
  if (!track)
    return MakeError("Track bulunamadı");

  SetOnlyTrackSelected(track);
  SetEditCurPos(0.0, false, false);

  const int beforeCount = CountTrackMediaItems(track);
  InsertMedia(audioPath.c_str(), 0);
  const int afterCount = CountTrackMediaItems(track);

  if (afterCount > beforeCount)
    return MakeOk("Ses yüklendi");
  return MakeError("Ses yüklenemedi");
}

std::string CmdClearTrack(int trackIndex)
{
  MediaTrack* track = GetTrack(nullptr, trackIndex);
  if (!track)
    return MakeError("Track bulunamadı");

  while (CountTrackMediaItems(track) > 0)
  {
    MediaItem* item = GetTrackMediaItem(track, 0);
    if (!item)
      break;
    DeleteTrackMediaItem(track, item);
  }

  return MakeOk("Track temizlendi");
}

std::string CmdRenderTrack(int trackIndex, const std::string& outputPath)
{
  MediaTrack* track = GetTrack(nullptr, trackIndex);
  if (!track)
    return MakeError("Track bulunamadı");

  const int trackCount = CountTracks(nullptr);
  std::vector<double> originalMutes;
  originalMutes.resize(static_cast<size_t>(trackCount), 0.0);

  for (int i = 0; i < trackCount; i++)
  {
    MediaTrack* t = GetTrack(nullptr, i);
    if (!t)
      continue;
    originalMutes[static_cast<size_t>(i)] = GetMediaTrackInfo_Value(t, "B_MUTE");
    SetMediaTrackInfo_Value(t, "B_MUTE", (i == trackIndex) ? 0.0 : 1.0);
  }

  const int itemCount = CountTrackMediaItems(track);
  double maxEnd = 0.0;
  for (int i = 0; i < itemCount; i++)
  {
    MediaItem* item = GetTrackMediaItem(track, i);
    if (!item)
      continue;
    const double itemStart = GetMediaItemInfo_Value(item, "D_POSITION");
    const double itemLen = GetMediaItemInfo_Value(item, "D_LENGTH");
    const double itemEnd = itemStart + itemLen;
    if (itemEnd > maxEnd)
      maxEnd = itemEnd;
  }

  if (maxEnd <= 0.0)
  {
    for (int i = 0; i < trackCount; i++)
    {
      MediaTrack* t = GetTrack(nullptr, i);
      if (!t)
        continue;
      SetMediaTrackInfo_Value(t, "B_MUTE", originalMutes[static_cast<size_t>(i)]);
    }
    return MakeError("Track'te ses bulunamadı");
  }

  double tsStart = 0.0;
  double tsEnd = maxEnd;
  GetSet_LoopTimeRange(true, false, &tsStart, &tsEnd, false);

  char origRenderFile[4096]{};
  char origRenderPattern[4096]{};
  GetSetProjectInfo_String(nullptr, "RENDER_FILE", origRenderFile, false);
  GetSetProjectInfo_String(nullptr, "RENDER_PATTERN", origRenderPattern, false);

  const auto outPath = std::filesystem::path(outputPath);
  const auto outDir = outPath.parent_path().string();
  std::string outName = outPath.stem().string();

  std::vector<char> newRenderFile(outDir.begin(), outDir.end());
  newRenderFile.push_back('\0');
  std::vector<char> newRenderPattern(outName.begin(), outName.end());
  newRenderPattern.push_back('\0');

  GetSetProjectInfo_String(nullptr, "RENDER_FILE", newRenderFile.data(), true);
  GetSetProjectInfo_String(nullptr, "RENDER_PATTERN", newRenderPattern.data(), true);

  GetSetProjectInfo(nullptr, "RENDER_BOUNDSFLAG", 2.0, true);
  GetSetProjectInfo(nullptr, "RENDER_SETTINGS", 0.0, true);

  Main_OnCommand(42230, 0);

  GetSetProjectInfo_String(nullptr, "RENDER_FILE", origRenderFile, true);
  GetSetProjectInfo_String(nullptr, "RENDER_PATTERN", origRenderPattern, true);

  for (int i = 0; i < trackCount; i++)
  {
    MediaTrack* t = GetTrack(nullptr, i);
    if (!t)
      continue;
    SetMediaTrackInfo_Value(t, "B_MUTE", originalMutes[static_cast<size_t>(i)]);
  }

  tsStart = 0.0;
  tsEnd = 0.0;
  GetSet_LoopTimeRange(true, false, &tsStart, &tsEnd, false);

  std::string json = "{\"success\":true,\"message\":\"";
  json += JsonEscape(outputPath);
  json += "\",\"outputPath\":\"";
  json += JsonEscape(outputPath);
  json += "\"}";
  return json;
}

void ProcessOneCommand()
{
  if (g_processing)
    return;
  g_processing = true;

  EnsureCommPaths();

  std::error_code ec;
  if (!std::filesystem::exists(g_commandFile, ec))
  {
    g_processing = false;
    return;
  }

  const auto contentOpt = ReadFile(g_commandFile);
  if (!contentOpt || contentOpt->empty())
  {
    g_processing = false;
    return;
  }

  const std::string content = *contentOpt;
  const auto commandOpt = JsonGetString(content, "command");
  const std::string command = commandOpt.value_or("");

  std::string response;

  if (command == "PING")
  {
    response = MakeOk("pong");
  }
  else if (command == "GET_TRACKS")
  {
    response = MakeTracks();
  }
  else if (command == "LOAD_AUDIO")
  {
    const int trackIndex = JsonGetInt(content, "trackIndex").value_or(-1);
    const std::string audioPath = JsonUnescapeSimple(JsonGetString(content, "audioPath").value_or(""));
    if (trackIndex < 0 || audioPath.empty())
      response = MakeError("Eksik parametre");
    else
      response = CmdLoadAudio(trackIndex, audioPath);
  }
  else if (command == "CLEAR_TRACK")
  {
    const int trackIndex = JsonGetInt(content, "trackIndex").value_or(-1);
    if (trackIndex < 0)
      response = MakeError("Eksik parametre");
    else
      response = CmdClearTrack(trackIndex);
  }
  else if (command == "RENDER_TRACK")
  {
    const int trackIndex = JsonGetInt(content, "trackIndex").value_or(-1);
    const std::string outputPath = JsonUnescapeSimple(JsonGetString(content, "outputPath").value_or(""));
    if (trackIndex < 0 || outputPath.empty())
      response = MakeError("Eksik parametre");
    else
      response = CmdRenderTrack(trackIndex, outputPath);
  }
  else
  {
    response = MakeError(std::string("Bilinmeyen komut: ") + command);
  }

  WriteFileAtomic(g_responseFile, response);
  TryDeleteFile(g_commandFile);
  g_processing = false;
}

void TimerProc()
{
  if (!g_rec)
    return;
  ProcessOneCommand();
}
} // namespace

extern "C" REAPER_PLUGIN_DLL_EXPORT int REAPER_PLUGIN_ENTRYPOINT(REAPER_PLUGIN_HINSTANCE hInstance, reaper_plugin_info_t* rec)
{
  if (!rec)
  {
    if (g_rec)
      g_rec->Register("-timer", reinterpret_cast<void*>(TimerProc));
    g_rec = nullptr;
    return 0;
  }

  if (rec->caller_version != REAPER_PLUGIN_VERSION)
    return 0;

  g_rec = rec;
  EnsureCommPaths();
  if (REAPERAPI_LoadAPI(rec->GetFunc) != 0)
    return 0;

  rec->Register("timer", reinterpret_cast<void*>(TimerProc));
  return 1;
}
