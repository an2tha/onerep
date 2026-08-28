cmake_minimum_required(VERSION 3.22.1)
project(needlejni C CXX)

# The archives are build artifacts of the model repo — 20 MB for arm64 alone —
# so they are fetched by `bun run needle:fetch` rather than committed, exactly
# like the pose weights. A build without them should say so in one line.
# The model repo names its slices android-arm64 and android-armv7; Gradle names
# the same two arm64-v8a and armeabi-v7a. One of the two has to be translated
# and this is the only place that knows about both.
if(ANDROID_ABI STREQUAL "arm64-v8a")
  set(NEEDLE_SLICE "android-arm64")
elseif(ANDROID_ABI STREQUAL "armeabi-v7a")
  set(NEEDLE_SLICE "android-armv7")
else()
  message(FATAL_ERROR "needle ships no engine for ${ANDROID_ABI}")
endif()

set(NEEDLE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../vendor/needle/${NEEDLE_SLICE}")
if(NOT EXISTS "${NEEDLE_DIR}/libneedle.a")
  message(FATAL_ERROR "libneedle.a missing for ${ANDROID_ABI}. Run: bun run needle:fetch")
endif()

add_library(needle STATIC IMPORTED)
set_target_properties(needle PROPERTIES IMPORTED_LOCATION "${NEEDLE_DIR}/libneedle.a")

add_library(needlejni SHARED needle_jni.c)
target_include_directories(needlejni PRIVATE "${NEEDLE_DIR}")

# The engine is C++ behind a C interface, and needle_jni.c is the only source
# here, so CMake picks C as the link language and drives the link with clang
# instead of clang++. That silently drops the entire C++ runtime: naming
# c++_static by hand gets libc++_static.a onto the line, but not the
# libc++abi.a it depends on, and the link dies on __cxa_throw,
# __cxa_free_exception and the __cxxabiv1 type_info vtables — every one of
# them referenced from inside libc++_static.a's own members, which reads like
# a corrupt archive rather than a runtime that was never linked.
#
# Declaring the link language CXX is what makes the NDK toolchain append its
# STL for us, libc++abi and the unwinder included, rather than guessing at
# sysroot library names here. Static rather than shared so the app does not
# have to package libc++_shared.so as well.
#
# lld resolves archives in one pass, so libneedle.a's references into
# libc++_static.a (and libc++_static.a's references into itself, e.g.
# __cxa_throw pulled in from a different member than std::runtime_error) need
# --start-group/--end-group to be re-scanned until nothing new resolves.
set_target_properties(needlejni PROPERTIES LINKER_LANGUAGE CXX)

target_link_libraries(needlejni PRIVATE
  log
  "-Wl,--start-group" needle c++_static "-Wl,--end-group"
)
