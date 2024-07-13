import React from "react"
import { createStore } from 'redux'
import { Provider } from "react-redux"
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import rootReducer from './store'
import Login from "./pages/login"
import PageLayout from "./layout"
import { ConfigProvider, ConfigProviderProps } from "antd"

import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import { GlobalContext } from "./context"

type Locale = ConfigProviderProps['locale'];

const store = createStore(rootReducer)

function App() {

    const setLang = () => { }

    const contextValue = {
        lang: "zh-CN",
        setLang: setLang
    }


    return (
        <BrowserRouter basename="/pro">
            <ConfigProvider
                locale={zhCN}
            >
                <Provider store={store}>
                    <GlobalContext.Provider value={contextValue}>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            {/* fix: 这里存在子路由 path不能使用 / 而应该使用/* */}
                            <Route path="/*" element={<PageLayout />} />
                        </Routes>
                    </GlobalContext.Provider>
                </Provider>
            </ConfigProvider>
        </BrowserRouter>

    )
}

export default App