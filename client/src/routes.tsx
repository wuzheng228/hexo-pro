import React from "react"
import { useMemo, useState } from "react"

export type IRoute = {
    name: string
    key: string
    icon?: React.ReactNode,
    children?: IRoute[]
}


export const routes: IRoute[] = [
    {
        key: 'posts',
        name: 'menu.posts',
        children: [
            {
                name: 'menu.posts.blogs',
                key: 'content/posts/blogs',
            },
            {
                name: 'menu.posts.drafts',
                key: 'content/posts/drafts',
            }
        ],
    },
    {
        name: 'menu.pages',
        key: 'content/pages',
    }
]

// 自定义钩子函数
const useRoute = (): [IRoute[], string] => {

    const [finalRoutes, _] = useState(routes)

    const defaultRoute = useMemo(() => {
        const first = finalRoutes[0]
        if (first) {
            const firstRoute = first?.children?.[0].key || first.key
            return firstRoute
        }
        return ''
    }, [finalRoutes])


    return [finalRoutes, defaultRoute]
}

export default useRoute

