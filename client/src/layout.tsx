import { Button, Menu, MenuProps } from 'antd'
import Sider from 'antd/es/layout/Sider'
import Layout, { Content } from 'antd/es/layout/layout'
import React, { Children, useEffect, useMemo, useRef, useState } from 'react'
import styles from './style/layout.module.less'
import useRoute, { IRoute } from './routes'
import { EditOutlined, MailOutlined } from '@ant-design/icons'
import useLocale from './hooks/useLocale'
import { ItemType, MenuItemType } from 'antd/es/menu/interface'
import lazyload from './utils/lazyload'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import qs from 'query-string'
import Navbar from './components/Navbar'
import Footer from './components/Footer'

type MenuItem = Required<MenuProps>['items'][number];

function getIconFromKey(key: string) {
    switch (key) {
        case '':
            return <EditOutlined />
        default:
            return <div className={styles['icon-empty']}></div>
    }
}

function getFlatternRoute(routes): any[] {
    const res = []
    function travel(_routes) {
        console.log(routes)
        _routes.forEach((route) => {
            if (route.key && !route.children) {
                try {
                    route.component = lazyload(() => import(`./pages/${route.key}`))
                    res.push(route)
                } catch (e) {
                    console.log(e)
                }
            }
            if (route.children && route.children.length) {
                travel(route.children)
            }
        })
    }
    travel(routes)
    return res
}

export default function PageLayout() {
    // 
    const navigate = useNavigate()
    const location = useLocation()

    const locale = useLocale()

    const currentComponent = qs.parseUrl(location.pathname).url.slice(1)
    const [routes, defaultRoute] = useRoute()
    const defaultSelectedKeys = [currentComponent || defaultRoute]

    const [selectedKeys, setSelectedKeys] = useState<string[]>(defaultSelectedKeys)

    const flatternRoutes = useMemo(() => getFlatternRoute(routes) || [], routes)

    const menuMap = useRef<
        Map<string, { menuItem?: boolean; subMenu?: boolean }>
    >(new Map())

    function reanderRoutes() {
        return function travel(_routes: IRoute[], level = 1): MenuItem[] {
            return _routes.map((route) => {
                if (!route.children) {
                    menuMap.current.set(route.key, { menuItem: true })
                    return {
                        key: route.key,
                        label: locale[route.name],
                        icon: getIconFromKey(route.key),
                        children: undefined
                    }
                } else {
                    menuMap.current.set(route.key, { subMenu: true })
                    return {
                        key: route.key,
                        label: locale[route.name],
                        icon: getIconFromKey(route.key),
                        children: travel(route.children, level + 1)
                    }
                }
            })
        }
    }

    function onClickItem(item) {
        console.log('item ====>', item)
        const { key } = item
        const currentRoute = flatternRoutes.find((r) => r.key === key)
        const component = currentRoute.component
        const preload = component.preload()
        preload.then(() => {
            navigate(currentRoute.path ? currentRoute.path : `/${key}`)
        })
    }

    function updateMenuStatus() {
        const pathKeys = location.pathname.split('/')
        const newSelectedKeys: string[] = []
        console.log("pathKeys ===>", pathKeys)
        while (pathKeys.length > 0) {
            const currentRouteKey = pathKeys.join('/')
            console.log('currentRouteKey', currentRouteKey)
            const menuKey = currentRouteKey.replace(/^\//, '') // 替换掉开头的下划线 /path ==> path
            console.log('menuKey===>', menuKey)
            const menuType = menuMap.current.get(menuKey)
            if (menuType && menuType.menuItem) {
                newSelectedKeys.push(menuKey)
            }

            pathKeys.pop()
        }
        setSelectedKeys(newSelectedKeys)
    }

    useEffect(() => {
        updateMenuStatus()
    }, [location.pathname])

    return (
        <Layout className={styles.layout}>
            <div>
                <Navbar />
            </div>
            <Layout>
                <Sider className={styles['layout-sider']}>
                    <Menu
                        style={{ height: '100%' }}
                        selectedKeys={selectedKeys}
                        onClick={onClickItem}
                        mode={"inline"}
                        items={reanderRoutes()(routes, 1)}
                    >
                    </Menu>
                </Sider>
                <Layout className={styles['layout-content']}>
                    <div className={styles['layout-content-wrapper']}>
                        <Content>
                            <Routes>
                                {
                                    flatternRoutes.map((route, index) => {
                                        const rout = (<Route
                                            key={index}
                                            path={`/${route.key}`}
                                            element={route.component.render()}
                                        />)
                                        console.log('rout ===>', route, 'path===>', `/${route.key}`)
                                        return rout
                                    })
                                }
                                <Route path="/"
                                    element={lazyload(() => import(`./pages/${defaultRoute}`)).render()}
                                />
                                <Route
                                    path="/post/:_id"
                                    element={lazyload(() => import('./pages/content/posts/post')).render()}
                                />
                                <Route
                                    path="/page/:_id"
                                    element={lazyload(() => import('./pages/content/pages/page')).render()}
                                />
                                <Route path="*"
                                    element={lazyload(() => import(`./pages/${defaultRoute}`)).render()}
                                />
                            </Routes>
                        </Content>
                    </div>
                    <Footer />
                </Layout>
            </Layout>
        </Layout>
    )
}