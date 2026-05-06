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
        utterance.rate = 1.3;

        // Try to select a high quality female voice matching the language
        const voices = window.speechSynthesis.getVoices();
        const matchingVoices = voices.filter(v => v.lang.startsWith(lang.split('-')[0]));
        if (matchingVoices.length > 0) {
            const scoredVoices = matchingVoices.map(v => {
                let score = 0;
                const nameLower = v.name.toLowerCase();

                // Prefer female voices (common names across Windows, macOS, Android, and Google)
                const femaleKeywords = [
                    'zira', 'maria', 'helena', 'sabina', 'laura', 'samantha', 'victoria',
                    'hazel', 'karen', 'tessa', 'kyoko', 'anna', 'elizabeth', 'susan',
                    'heera', 'haruka', 'yaoyao', 'huihui', 'female', 'elsa', 'luciana',
                    'isabela', 'marta', 'conchita', 'monica', 'paulina'
                ];
                if (femaleKeywords.some(keyword => nameLower.includes(keyword))) {
                    score += 10;
                }

                // Prefer natural/high-quality voices
                if (nameLower.includes('natural')) score += 20;
                if (nameLower.includes('google')) score += 10;

                return { voice: v, score };
            });

            scoredVoices.sort((a, b) => b.score - a.score);
            utterance.voice = scoredVoices[0].voice;
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
