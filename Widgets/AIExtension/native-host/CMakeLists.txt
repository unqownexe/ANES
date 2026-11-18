cmake_minimum_required(VERSION 3.20)
project(anes_native_host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_executable(anes_native_host anes_native_host.cpp)
target_compile_definitions(anes_native_host PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(anes_native_host PRIVATE /W4 /O2 /utf-8 /permissive- /EHsc)
set_target_properties(anes_native_host PROPERTIES
    OUTPUT_NAME "anes_native_host"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/bin"
)
