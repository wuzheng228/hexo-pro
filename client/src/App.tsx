import React from "react"
import { createStore } from 'redux'
import { Provider } from "react-redux"
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import rootReducer from './store'
import Login from "./pages/login"
import PageLayout from "./layout"

const store = createStore(rootReducer)

function App() {
    return (
        <BrowserRouter >
            <Provider store={store}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<PageLayout />} />
                </Routes>
            </Provider>
        </BrowserRouter>

    )
}

export default App