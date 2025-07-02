// packages/cli/src/modules/voice-input/voiceRecognizer.ts
import { SpeechClient } from '@google-cloud/speech';
import mic from 'mic'; // mic パッケージのデフォルトエクスポートが Instance の場合を想定
// もし型定義が別途必要なら import type { MicInstance } from 'mic'; のようにする

interface VoiceRecognizerOptions {
  sampleRateHertz?: number;
  languageCode?: string;
  onTranscription: (transcription: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
}

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_LANGUAGE_CODE = 'ja-JP';

let speechClientInstance: SpeechClient | null = null;
let micInstance: any | null = null; // mic の型に合わせて調整
let recognizeStream: any | null = null; // ストリーミングリクエストの型に合わせて調整

function getSpeechClient(): SpeechClient {
  if (!speechClientInstance) {
    try {
      speechClientInstance = new SpeechClient();
    } catch (error) {
      console.error('Failed to create SpeechClient:', error);
      // ここでエラーを呼び出し元に通知するか、あるいはアプリケーション全体でエラー処理をする必要がある
      throw new Error(
        'Failed to initialize Google Cloud Speech client. Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly.',
      );
    }
  }
  return speechClientInstance;
}

export function startRecording(options: VoiceRecognizerOptions): void {
  const {
    sampleRateHertz = DEFAULT_SAMPLE_RATE,
    languageCode = DEFAULT_LANGUAGE_CODE,
    onTranscription,
    onError,
  } = options;

  if (micInstance) {
    console.warn('Recording is already in progress.');
    return;
  }

  try {
    const client = getSpeechClient();

    micInstance = mic({
      rate: String(sampleRateHertz),
      channels: '1',
      debug: false, // 必要に応じて true にする
      device: 'default', // TODO: 設定可能にするか検討
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('error', (err: Error) => {
      console.error('Error in Mic Input Stream:', err);
      onError(new Error(`Mic input stream error: ${err.message}`));
      stopRecording(); // エラー発生時は録音を停止
    });

    recognizeStream = client
      .streamingRecognize({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCode,
          enableAutomaticPunctuation: true, // 句読点を有効化
        },
        interimResults: true, // 途中結果も取得
      })
      .on('error', (err: Error) => {
        console.error('Error in Speech Recognition Stream:', err);
        if (err.message.includes('Quota exceeded')) {
            onError(new Error('Speech-to-Text API quota exceeded. Please check your GCP project quota or billing status.'));
        } else if (err.message.includes('requires billing to be enabled')) {
            onError(new Error('Speech-to-Text API requires billing to be enabled for the project.'));
        } else if (err.message.includes('Could not authorize request')) {
            onError(new Error('Could not authorize Speech-to-Text API request. Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly and the service account has permissions.'));
        }
         else {
            onError(new Error(`Speech recognition stream error: ${err.message}`));
        }
        stopRecording(); // エラー発生時は録音を停止
      })
      .on('data', (data: any) => { // data の型は API のレスポンスに合わせる
        const transcription = data.results[0]?.alternatives[0]?.transcript || '';
        const isFinal = data.results[0]?.isFinal || false;
        if (transcription) {
          onTranscription(transcription, isFinal);
        }
      });

    micInputStream.pipe(recognizeStream);
    micInstance.start();
    console.log('Voice recording started.');

  } catch (error: any) {
    console.error('Failed to start recording:', error);
    onError(new Error(`Failed to start recording: ${error.message}`));
    stopRecording();
  }
}

export function stopRecording(): void {
  if (micInstance) {
    micInstance.stop();
    console.log('Mic instance stopped.');
    // micInstance の 'stopComplete' イベントを待つのが理想
  }

  if (recognizeStream) {
    recognizeStream.destroy(); // ストリームを即座に破棄
    console.log('Speech recognize stream destroyed.');
  }

  micInstance = null;
  recognizeStream = null;
  console.log('Voice recording stopped.');
}

// アプリケーション終了時などにリソースを解放する関数
export function cleanupVoiceResources(): void {
  stopRecording(); // 念のため録音を停止
  if (speechClientInstance) {
    speechClientInstance.close().catch(console.error);
    speechClientInstance = null;
    console.log('Speech client closed.');
  }
}
