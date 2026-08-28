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

# The engine is C++ behind a C interface. Without c++_static the link fails on
# __cxa_throw and a pile of std:: symbols, which reads like a corrupt archive
# rather than a missing runtime; static rather than shared so the app does not
# have to package libc++_shared.so as well.
# lld resolves archives in one pass, so libneedle.a's references into
# libc++_static.a (and libc++_static.a's references into itself, e.g.
# __cxa_throw pulled in from a different member than std::runtime_error) need
# --start-group/--end-group to be re-scanned until nothing new resolves.
target_link_libraries(needlejni PRIVATE
  log
  "-Wl,--start-group" needle c++_static "-Wl,--end-group"
)
