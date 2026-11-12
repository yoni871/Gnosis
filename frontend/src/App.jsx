import './App.css'
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import StudyPage from './pages/StudyPage';
import ScrollManager from './components/Navigation/ScrollManager';

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
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
// Biblical History: three lazy routes, declared before the catch-all.
// The Markdown renderer travels with these routes only — a reader who
// never opens History downloads none of it.
const BiblicalHistoryIndexPage = lazy(() => import('./pages/BiblicalHistoryIndexPage'));
const BiblicalHistoryBookPage = lazy(() => import('./pages/BiblicalHistoryBookPage'));
const BiblicalHistoryEventPage = lazy(() => import('./pages/BiblicalHistoryEventPage'));

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
          <ScrollManager />
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

            {/*
              Biblical History: the index lists all 66 books, a book page
              shows its events and timeline, and the event route is the
              same book page with one event's panel open.
            */}
            <Route
              path='/biblical-history'
              element={<BiblicalHistoryIndexPage />}
            />

            <Route
              path='/biblical-history/:book'
              element={<BiblicalHistoryBookPage />}
            />

            <Route
              path='/biblical-history/:book/:event'
              element={<BiblicalHistoryEventPage />}
            />

            {/* Catch-all: without this, an unmatched URL renders a blank
                page — React Router has nothing to show. The 404 page
                carries the site header and footer so the visitor can
                always navigate onward. */}
            <Route
              path='*'
              element={<NotFoundPage />}
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
