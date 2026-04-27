import React from 'react';
import { useAuth } from '../lib/authStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/atoms/Button';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, loginLoading } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8 p-8 bg-surface-variant/20 rounded-3xl border border-outline-variant/30 backdrop-blur-sm"
      >
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/10 rounded-2xl">
              <LogIn className="w-12 h-12 text-primary" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-on-surface">
            {t('auth.welcome_title')}
          </h2>
          <p className="mt-2 text-on-surface-variant">
            {t('auth.welcome_subtitle')}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 py-6 text-lg font-semibold"
            variant="primary"
            isLoading={loginLoading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t('auth.sign_in_with_google')}
          </Button>
        </div>

        <div className="mt-6 text-center text-xs text-on-surface-variant/60">
          <p>{t('auth.terms_and_privacy')}</p>
        </div>
      </motion.div>
    </div>
  );
};
