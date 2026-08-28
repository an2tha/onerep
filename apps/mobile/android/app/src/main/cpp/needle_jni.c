/*
 * JNI in front of libneedle.a.
 *
 * Kotlin cannot call into a static archive, so this is compiled into
 * libneedlejni.so and linked against it. Nothing here makes a decision: it
 * copies strings across the JNI boundary, calls one of four C functions, and
 * copies the answer back. Every policy — which tools exist, what a low
 * confidence means, how many steps a loop may take — lives in TypeScript.
 *
 * Thread safety is the caller's problem, and NeedlePlugin.kt solves it with a
 * single-threaded executor. The engine is one process-global instance behind
 * free functions; there is no handle to lock.
 */
#include <jni.h>
#include <stdlib.h>
#include <string.h>

#include "needle.h"

/*
 * The weights, held for the life of the process and never freed.
 *
 * needle_load() is handed a pointer and the header promises nothing about
 * copying, while the JNI byte array it came from is collectable the moment this
 * function returns. 13 MB of resident heap is the price of that uncertainty.
 */
static unsigned char *g_weights = NULL;

JNIEXPORT jint JNICALL
Java_com_ananthh_onerep_NeedlePlugin_nativeLoad(JNIEnv *env, jclass clazz, jbyteArray weights) {
  (void)clazz;
  const jsize length = (*env)->GetArrayLength(env, weights);
  unsigned char *copy = (unsigned char *)malloc((size_t)length);
  if (copy == NULL) return -1;
  (*env)->GetByteArrayRegion(env, weights, 0, length, (jbyte *)copy);
  /* Negative is the failure. These entry points answer with counts, not a
   * status: init returns the size of the tool context, complete the bytes
   * written. */
  const int code = needle_load(copy, (unsigned long long)length);
  if (code < 0) {
    free(copy);
    return code;
  }
  free(g_weights);
  g_weights = copy;
  return 0;
}

JNIEXPORT jint JNICALL
Java_com_ananthh_onerep_NeedlePlugin_nativeInit(JNIEnv *env, jclass clazz, jstring system,
                                                jstring tools, jstring indexPath) {
  (void)clazz;
  const char *system_chars = system ? (*env)->GetStringUTFChars(env, system, NULL) : NULL;
  const char *tools_chars = tools ? (*env)->GetStringUTFChars(env, tools, NULL) : NULL;
  const char *index_chars = indexPath ? (*env)->GetStringUTFChars(env, indexPath, NULL) : NULL;

  const int code = needle_init(system_chars, tools_chars, index_chars);

  if (system_chars) (*env)->ReleaseStringUTFChars(env, system, system_chars);
  if (tools_chars) (*env)->ReleaseStringUTFChars(env, tools, tools_chars);
  if (index_chars) (*env)->ReleaseStringUTFChars(env, indexPath, index_chars);
  return code;
}

/*
 * Returns the turn's JSON, or NULL when the engine reported a failure.
 *
 * The buffer is heap-allocated rather than a stack array: 64 KB is most of a
 * default thread stack on Android, and the crash that produces is a corrupted
 * frame rather than an honest overflow.
 */
JNIEXPORT jstring JNICALL
Java_com_ananthh_onerep_NeedlePlugin_nativeComplete(JNIEnv *env, jclass clazz, jstring input,
                                                    jint maxNewTokens, jint capacity) {
  (void)clazz;
  char *out = (char *)malloc((size_t)capacity);
  if (out == NULL) return NULL;
  out[0] = '\0';

  const char *input_chars = (*env)->GetStringUTFChars(env, input, NULL);
  const int written = needle_complete(input_chars, maxNewTokens, out, capacity);
  (*env)->ReleaseStringUTFChars(env, input, input_chars);

  if (written < 0) {
    free(out);
    return NULL;
  }
  /* The engine NUL-terminates within the buffer; belt and braces for a turn
   * that filled it exactly, where the last byte would otherwise be content. */
  out[capacity - 1] = '\0';
  jstring result = (*env)->NewStringUTF(env, out);
  free(out);
  return result;
}

JNIEXPORT void JNICALL
Java_com_ananthh_onerep_NeedlePlugin_nativeReset(JNIEnv *env, jclass clazz) {
  (void)env;
  (void)clazz;
  needle_reset();
}
