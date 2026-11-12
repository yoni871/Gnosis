import './App.css'
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
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
// Biblical History routes, declared before the catch-all.
// The Markdown renderer travels with these routes only — a reader who
// never opens History downloads none of it.
const BiblicalHistoryIndexPage = lazy(() => import('./pages/BiblicalHistoryIndexPage'));
const BiblicalHistoryBookRedirect = lazy(() => import('./pages/BiblicalHistoryBookRedirect'));
const BiblicalHistoryEventPage = lazy(() => import('./pages/BiblicalHistoryEventPage'));
// Trace the Doctrine homepage (homepage only — no study workspace yet).
const TraceTheDoctrinePage = lazy(() => import('./pages/TraceTheDoctrinePage'));
// Trace the Doctrine study workspace: the Trinity preview study. The
// workspace page is noindex and never listed in the sitemap.
const TraceTheDoctrineTrinityPage = lazy(() => import('./pages/TraceTheDoctrineTrinityPage'));

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
              Biblical History: the index lists all 66 books, the book
              route redirects to the book's first published event (or
              its Upcoming state when it has none), and the event route
              is the study page — the book's timeline with one event's
              panel open.
            */}
            <Route
              path='/biblical-history'
              element={<BiblicalHistoryIndexPage />}
            />

            <Route
              path='/biblical-history/books'
              element={<Navigate to='/biblical-history#history-books' replace />}
            />

            <Route
              path='/biblical-history/:book'
              element={<BiblicalHistoryBookRedirect />}
            />

            <Route
              path='/biblical-history/:book/:event'
              element={<BiblicalHistoryEventPage />}
            />

            {/*
              Trace the Doctrine: the homepage introduces the planned
              categories; the Trinity study workspace is its first
              preview study, directly beneath the homepage route. The
              workspace is noindex and never listed in the sitemap.
            */}
            <Route
              path='/trace-the-doctrine'
              element={<TraceTheDoctrinePage />}
            />

            <Route
              path='/trace-the-doctrine/trinity'
              element={<TraceTheDoctrineTrinityPage />}
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
