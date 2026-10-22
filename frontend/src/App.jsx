import './App.css'
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StudyPage from './pages/StudyPage';
import SearchResultsPage from './pages/SearchResultsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

function App() {

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/* Open the study reader when someone visits the homepage. */}
            <Route
              path="/"
              element={<Navigate to="/bible/Genesis/1" replace />}
            />

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

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
