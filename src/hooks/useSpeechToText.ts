import { useState, useEffect, useRef } from 'react';

interface UseSpeechToTextOptions {
    lang?: string;
    onResult?: (text: string) => void;
    onError?: (error: string) => void;
}

export function useSpeechToText({ lang = 'en-US', onResult, onError }: UseSpeechToTextOptions = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef<any>(null);
    const onResultRef = useRef(onResult);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported in this browser.');
            return;
        }

        console.log('useSpeechToText: initializing SpeechRecognition with lang =', lang);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = lang;

        recognition.onstart = () => {
            console.log('Speech recognition started listening');
            setIsListening(true);
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            setIsListening(false);
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (onErrorRef.current) onErrorRef.current(event.error);
            setIsListening(false);
        };

        recognition.onresult = (event: any) => {
            console.log('Speech recognition onresult event:', event);
            if (event.results && event.results[0] && event.results[0][0]) {
                const speechToText = event.results[0][0].transcript;
                console.log('Recognized text:', speechToText);
                setTranscript(speechToText);
                if (onResultRef.current) onResultRef.current(speechToText);
            } else {
                console.warn('Speech recognition event had no results:', event);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [lang]);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            setTranscript('');
            try {
                recognitionRef.current.start();
            } catch (err) {
                console.error('Failed to start speech recognition:', err);
            }
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            try {
                recognitionRef.current.stop();
            } catch (err) {
                console.error('Failed to stop speech recognition:', err);
            }
        }
    };

    return {
        isListening,
        transcript,
        startListening,
        stopListening,
        isSupported: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    };
}
