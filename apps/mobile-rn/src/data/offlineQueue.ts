import AsyncStorage from "@react-native-async-storage/async-storage";
export type QueuedOperation = {
  id: string;
  name: string;
  payload: unknown;
  createdAt: number;
};
const KEY = "onerep-rn-offline-queue-v1";
export async function readQueue(): Promise<QueuedOperation[]> {
  const value = await AsyncStorage.getItem(KEY);
  return value ? JSON.parse(value) : [];
}
export async function enqueueOperation(name: string, payload: unknown) {
  const queue = await readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    payload,
    createdAt: Date.now(),
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  return queue;
}
export async function clearQueue() {
  await AsyncStorage.removeItem(KEY);
}
