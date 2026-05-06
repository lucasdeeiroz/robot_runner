import { useState, useEffect, useRef } from 'react';

interface UseTextToSpeechOptions {
    lang?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
}

export function useTextToSpeech({ lang = 'en-US', onStart, onEnd, onError }: UseTextToSpeechOptions = {}) {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    const speak = (text: string) => {
        if (!('speechSynthesis' in window)) {
            console.warn('Text-to-speech not supported in this browser.');
            return;
        }

        // Cancel any active speaking to prevent overlaps
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        // Try to select a high quality voice matching the language
        const voices = window.speechSynthesis.getVoices();
        const matchingVoices = voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
        if (matchingVoices.length > 0) {
            // Prefer natural or high-quality voices if available
            const bestVoice = matchingVoices.find(v => v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('google')) || matchingVoices[0];
            utterance.voice = bestVoice;
        }

        utterance.onstart = () => {
            setIsSpeaking(true);
            if (onStart) onStart();
        };

        utterance.onend = () => {
            setIsSpeaking(false);
            if (onEnd) onEnd();
        };

        utterance.onerror = (event: any) => {
            console.error('Speech synthesis error:', event.error);
            setIsSpeaking(false);
            if (onError) onError(event.error);
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    };

    const stop = () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    };

    useEffect(() => {
        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    return {
        isSpeaking,
        speak,
        stop,
        isSupported: 'speechSynthesis' in window
    };
}
