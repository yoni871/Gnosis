import './App.css'
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import StudyPage from './pages/StudyPage';

// The remaining routes load on demand, so a first visit never downloads
// or parses the auth, search, and About pages. Landing and the reader
// stay eager: they are the two entry routes, and splitting them would
// add a round-trip to the first paint.
const AboutPage = lazy(() => import('./pages/AboutPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyPage = lazy(() => import('./pages/VerifyPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

function RouteLoading() {
    return (
        <main
            role="status"
            aria-live="polite"
            className="flex min-h-[50vh] items-center justify-center text-[14px] text-[var(--text-muted)]"
        >
            Loading…
        </main>
    );
}

function App() {

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
          <Routes>

            {/*
              The homepage is the public landing page. It sets its own
              metadata (LANDING_TITLE / LANDING_DESCRIPTION from
              src/utils/seo.js) and is listed in the sitemap. The Bible
              study reader stays at /bible/:book/:chapter.
            */}
            <Route
              path="/"
              element={<LandingPage />}
            />

            <Route path='/about' element={<AboutPage />} />

            <Route path='/privacy' element={<PrivacyPage />} />

            <Route path='/settings' element={<SettingsPage />} />

            <Route 
              path='/bible/:book/:chapter'
              element={<StudyPage />}
            />

            <Route
              path='/search'
              element={<SearchResultsPage />} 
            />

            <Route
              path='/login' 
              element={<LoginPage />}
            />

            <Route
              path='/register' 
              element={<RegisterPage />}
            />

            <Route
              path='/verify-email'
              element={<VerifyPage />}
            />

            <Route
              path='/forgot-password'
              element={<ForgotPasswordPage />}
            />

            <Route
              path='/reset-password'
              element={<ResetPasswordPage />}
            />

          </Routes>
          </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
