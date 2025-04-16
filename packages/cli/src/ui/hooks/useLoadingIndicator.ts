import { useState, useEffect, useRef } from 'react';
import { WITTY_LOADING_PHRASES, PHRASE_CHANGE_INTERVAL_MS } from '../constants.js';
import { StreamingState } from '../../core/StreamingState.js';

export const useLoadingIndicator = (streamingState: StreamingState) => {
	const [elapsedTime, setElapsedTime] = useState(0);
	const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(WITTY_LOADING_PHRASES[0]);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const currentPhraseIndexRef = useRef<number>(0);

	// Timer effect for elapsed time during loading
	useEffect(() => {
		if (streamingState === StreamingState.Responding) {
			setElapsedTime(0); // Reset timer on new loading start
			timerRef.current = setInterval(() => {
				setElapsedTime((prevTime) => prevTime + 1);
			}, 1000);
		} else if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		// Cleanup on unmount or when isLoading changes
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [streamingState]);

	// Effect for cycling through witty loading phrases
	useEffect(() => {
		if (streamingState === StreamingState.Responding) {
			currentPhraseIndexRef.current = 0;
			setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
			phraseIntervalRef.current = setInterval(() => {
				currentPhraseIndexRef.current = (currentPhraseIndexRef.current + 1) % WITTY_LOADING_PHRASES.length;
				setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[currentPhraseIndexRef.current]);
			}, PHRASE_CHANGE_INTERVAL_MS);
		} else if (phraseIntervalRef.current) {
			clearInterval(phraseIntervalRef.current);
			phraseIntervalRef.current = null;
		}
		// Cleanup on unmount or when isLoading changes
		return () => {
			if (phraseIntervalRef.current) {
				clearInterval(phraseIntervalRef.current);
			}
		};
	}, [streamingState]);

	return { elapsedTime, currentLoadingPhrase };
};