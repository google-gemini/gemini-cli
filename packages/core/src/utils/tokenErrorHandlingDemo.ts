/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 토큰 제한 에러 처리 시스템 데모
 *
 * 이 파일은 구현한 4단계 토큰 에러 처리 시스템의 사용 예시를 보여줍니다:
 * 1. 사용자 친화적 에러 메시지
 * 2. 자동 컨텍스트 축소 및 재시도 메커니즘
 * 3. 스마트 토큰 관리 시스템
 * 4. 예방적 토큰 모니터링 시스템
 */

import {
  TokenManager,
  DEFAULT_TOKEN_CONFIG,
  isTokenLimitExceededError,
  extractTokenInfo,
  getTokenLimitErrorMessage,
} from './tokenErrorHandling.js';
import {
  ContextCompressor,
  CompressionStrategy,
  TokenErrorRetryHandler,
} from './contextCompression.js';
import {
  ProactiveTokenMonitor,
  DEFAULT_MONITORING_CONFIG,
  formatTokenUsage,
  createTokenUsageProgressBar,
} from './proactiveTokenMonitoring.js';
import type { Content } from '@google/genai';

// 데모 함수들
export async function demonstrateTokenErrorHandling() {
  console.log('🚀 토큰 제한 에러 처리 시스템 데모 시작\n');

  // 1. 사용자 친화적 에러 메시지 데모
  console.log('1️⃣ 사용자 친화적 에러 메시지 데모');
  const errorString =
    'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).';

  if (isTokenLimitExceededError(errorString)) {
    const tokenInfo = extractTokenInfo(errorString);
    if (tokenInfo) {
      const friendlyMessage = getTokenLimitErrorMessage({
        kind: 'token-limit-exceeded',
        currentTokens: tokenInfo.current,
        maxTokens: tokenInfo.max,
        message: errorString,
      });
      console.log('📝 친화적 에러 메시지:');
      console.log(friendlyMessage);
    }
  }
  console.log('');

  // 2. 토큰 관리자 데모
  console.log('2️⃣ 스마트 토큰 관리 시스템 데모');
  const tokenManager = new TokenManager(DEFAULT_TOKEN_CONFIG);

  // 토큰 사용량 업데이트
  tokenManager.updateTokenUsage({
    promptTokens: 500000,
    completionTokens: 200000,
    totalTokens: 700000,
  });

  console.log('📊 현재 토큰 사용량:', tokenManager.getCurrentUsage());
  console.log('📊 남은 토큰 용량:', tokenManager.getRemainingCapacity());
  console.log('📊 압축 권장 여부:', tokenManager.shouldCompress());
  console.log('');

  // 3. 컨텍스트 압축 데모
  console.log('3️⃣ 자동 컨텍스트 축소 데모');
  const compressor = new ContextCompressor(tokenManager);

  // 테스트용 컨텍스트 생성
  const testContent: Content[] = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [{ text: `메시지 ${i}: 이것은 테스트 메시지입니다.`.repeat(10) }],
  }));

  console.log('📝 원본 메시지 수:', testContent.length);

  const compressionResult = await compressor.compressContext(testContent, {
    strategy: CompressionStrategy.PRIORITIZE_RECENT,
    maxTokens: 100000,
    preserveRecent: 3,
    summaryRatio: 0.5,
  });

  console.log(
    '📝 압축된 메시지 수:',
    compressionResult.compressedContent.length,
  );
  console.log('📝 압축 비율:', compressionResult.compressionRatio);
  console.log('📝 절약된 토큰:', compressionResult.tokensSaved);
  console.log('');

  // 4. 예방적 모니터링 데모
  console.log('4️⃣ 예방적 토큰 모니터링 데모');
  const monitor = new ProactiveTokenMonitor(
    tokenManager,
    DEFAULT_MONITORING_CONFIG,
  );

  // 알림 콜백 등록
  monitor.addAlertCallback((alert) => {
    console.log(`🚨 토큰 알림 [${alert.level}]: ${alert.message}`);
    console.log(`💡 권장 조치: ${alert.recommendedAction}`);
  });

  // 토큰 사용량 확인
  monitor.checkTokenUsage();

  const stats = monitor.getTokenStatistics();
  console.log('📊 토큰 통계:', formatTokenUsage(stats));
  console.log('📊 진행률 바:', createTokenUsageProgressBar(stats));

  const recommendation = monitor.getCompressionRecommendation();
  console.log('💡 압축 권장사항:', recommendation);
  console.log('');

  // 5. 재시도 핸들러 데모
  console.log('5️⃣ 자동 재시도 메커니즘 데모');
  const retryHandler = new TokenErrorRetryHandler(tokenManager);

  // 모의 API 호출 함수
  let attemptCount = 0;
  const mockApiCall = async (content: Content[]) => {
    attemptCount++;
    console.log(
      `🔄 API 호출 시도 ${attemptCount} (컨텍스트 길이: ${content.length})`,
    );

    if (attemptCount === 1) {
      // 첫 번째 시도는 토큰 제한 에러 발생
      throw new Error(
        'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).',
      );
    }

    // 두 번째 시도는 성공
    return { success: true, message: 'API 호출 성공!' };
  };

  try {
    const result = await retryHandler.handleTokenLimitError(
      testContent,
      mockApiCall,
    );
    console.log('✅ 최종 결과:', result);
  } catch (error) {
    console.log('❌ 최종 에러:', error);
  }

  console.log('\n🎉 토큰 제한 에러 처리 시스템 데모 완료!');
}

// 사용 예시
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateTokenErrorHandling().catch(console.error);
}
