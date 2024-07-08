import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Form, Input } from "antd";
import React, { useState } from "react";
import styles from './style/index.module.css'

export default function LoginForm() {
    const [errorMessage, setErrorMessage] = useState('')

    return (
        <div className={styles['login-form-wrapper']}>
            <div className={styles['login-form-title']}>登录 Hexo Pro</div>
            <div className={styles['login-form-sub-title']}>Login Hexo Pro</div>
            <div>{errorMessage}</div>
            <Form
                layout="vertical"
            >
                <Form.Item
                    label="用户名"
                    name={"username"}
                >
                    <Input
                        prefix={<UserOutlined />}
                    />
                </Form.Item>
                <Form.Item
                    label="密码"
                    name="password"
                >
                    <Input.Password
                        prefix={<LockOutlined />}
                    />
                </Form.Item>
            </Form>
        </div >
    )
}