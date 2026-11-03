// Web Speech API (SpeechRecognition) typings + constructor lookup. Chrome/Edge expose it as webkitSpeechRecognition.
export interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; length: number; [j: number]: { transcript: string } };
}
export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type W = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export const RecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? ((window as unknown as W).SpeechRecognition ?? (window as unknown as W).webkitSpeechRecognition) : undefined;

export const hasWebSpeech = () => !!RecognitionCtor;
export const hasMediaRecorder = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
}
