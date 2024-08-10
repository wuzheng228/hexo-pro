import { LockOutlined, UserOutlined } from "@ant-design/icons"
import { Button, Form, Input, message } from "antd"
import React, { useRef, useState } from "react"
import styles from './style/index.module.less'
import useLocale from "@/hooks/useLocale"
import localeValues from "antd/locale/en_US"
import service from "@/utils/api"
import useStorage from "@/utils/useStorage"

export default function LoginForm() {

    const formRef = useRef(null)
    const [errorMessage, setErrorMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [loginParams, setLoginParams, removeLoginParams] =
        useStorage('loginParams');

    const [rememberPassword, setRememberPassword] = useState(!!loginParams);

    const t = useLocale()


    function afterLoginSuccess(params, token) {
        // 记住密码
        if (rememberPassword) {
            setLoginParams(JSON.stringify(params));
        } else {
            removeLoginParams();
        }
        // 记录登录状态
        if (token) {
            localStorage.setItem('userStatus', 'login');
            localStorage.setItem('hexoProToken', token)
        } else {
            localStorage.setItem('userStatus', 'unsafe');
        }
        // 跳转首页
        window.location.href = '/pro';
    }

    function login(params) {
        setLoading(true)
        service
            .post('/hexopro/api/login', params)
            .then((res) => {
                const { code, msg, token } = res.data;
                if (code === 0) {
                    afterLoginSuccess(params, token);
                } else if (code === -2) {
                    afterLoginSuccess(params, null);
                } else if (code === -1) {
                    setErrorMessage(t['login.form.login.errMsg']);
                }
                else {
                    setErrorMessage(msg || t['login.form.login.errMsg']);
                }
            })
            .finally(() => {
                setLoading(false);
            });
    }

    function onSubmitClick() {
        formRef.current.validateFields().then((values) => {
            login(values)
        }).catch((ignore) => {
        })
    }

    const onFinishFailed = () => {
        message.error('Submit failed!');
    };

    return (
        <div className={styles['login-form-wrapper']}>
            <div className={styles['login-form-title']}>登录 Hexo Pro</div>
            <div className={styles['login-form-sub-title']}>Login Hexo Pro</div>
            <div>{errorMessage}</div>
            <Form
                onFinishFailed={onFinishFailed}
                ref={formRef}
                layout="vertical"
            >
                <Form.Item
                    rules={[{ required: true }]}
                    label="用户名"
                    name={"username"}
                >
                    <Input
                        prefix={<UserOutlined />}
                    />
                </Form.Item>
                <Form.Item
                    rules={[{ required: true }]}
                    label="密码"
                    name="password"
                >
                    <Input.Password
                        prefix={<LockOutlined />}
                    />
                </Form.Item>
                <Button type="primary" onClick={onSubmitClick} loading={loading}>
                    {t['login.form.login']}
                </Button>
            </Form>
        </div >
    )
}