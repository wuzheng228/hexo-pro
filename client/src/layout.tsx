import { Button } from 'antd'
import Sider from 'antd/es/layout/Sider'
import Layout, { Content, Header } from 'antd/es/layout/layout'
import React from 'react'

export default function PageLayout() {

    return (
        <Layout hasSider={false}>
            <Header style={{ display: 'flex', alignItems: 'center' }}>Header</Header>
            <Layout>
                <Sider width={200}>
                    <Button type="primary" >
                        Search
                    </Button>
                    SiderSiderSiderSiderSiderSiderSiderSiderSiderSiderSiderSider
                </Sider>
            </Layout>
            <Layout style={{ padding: '0 24px 24px' }}>
                <Content
                    style={{
                        padding: 24,
                        margin: 0,
                        minHeight: 280
                    }}
                >
                    Content
                </Content>
            </Layout>

        </Layout>
    )
}