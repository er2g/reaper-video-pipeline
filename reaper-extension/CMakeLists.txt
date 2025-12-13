cmake_minimum_required(VERSION 3.22)

project(reaper_video_fx_bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(reaper_video_fx_bridge SHARED
  src/reaper_video_fx_bridge.cpp
)

target_include_directories(reaper_video_fx_bridge PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}/../reaper-sdk-main/sdk"
)

if (WIN32)
  set_target_properties(reaper_video_fx_bridge PROPERTIES
    OUTPUT_NAME "reaper_video_fx_bridge"
  )
endif()

set(_dist_dir "${CMAKE_CURRENT_LIST_DIR}/dist")
add_custom_command(TARGET reaper_video_fx_bridge POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "${_dist_dir}"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "$<TARGET_FILE:reaper_video_fx_bridge>"
    "${_dist_dir}/$<TARGET_FILE_NAME:reaper_video_fx_bridge>"
)

