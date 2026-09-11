import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StudyPage from './pages/StudyPage';
import SearchResultsPage from './pages/SearchResultsPage';

function App() {

  return (
    <BrowserRouter>
      <Routes>

        <Route 
          path='/bible/:book/:chapter'
          element={<StudyPage />}
        />

        <Route
          path='/search'
          element={<SearchResultsPage />} 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
