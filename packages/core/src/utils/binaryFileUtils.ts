/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBinaryFile } from 'isbinaryfile';

/**
 * Элегантная проверка, является ли файл бинарным
 * Использует библиотеку isbinaryfile для анализа содержимого файла
 * вместо костыльных проверок по расширениям и эвристикам
 */
export async function isBinaryFileElegant(filePath: string): Promise<boolean> {
  try {
    // isbinaryfile анализирует первые байты файла (magic numbers и наличие \0)
    // Это эффективно и не требует чтения всего файла
    return await isBinaryFile(filePath);
  } catch (error) {
    // Если произошла ошибка (файл не существует, нет прав доступа и т.д.),
    // считаем файл текстовым и позволяем вышестоящим функциям обработать ошибку
    console.warn(`Failed to check if file is binary: ${filePath}`, error);
    return false;
  }
}

/**
 * Синхронная версия для случаев, когда асинхронность не нужна
 */
export function isBinaryFileElegantSync(filePath: string): boolean {
  try {
    const { isBinaryFileSync } = require('isbinaryfile');
    return isBinaryFileSync(filePath);
  } catch (error) {
    console.warn(`Failed to check if file is binary (sync): ${filePath}`, error);
    return false;
  }
}

/**
 * Проверяет, является ли файл текстовым (противоположность бинарному)
 */
export async function isTextFileElegant(filePath: string): Promise<boolean> {
  return !(await isBinaryFileElegant(filePath));
}

/**
 * Синхронная версия проверки текстового файла
 */
export function isTextFileElegantSync(filePath: string): boolean {
  return !isBinaryFileElegantSync(filePath);
}
