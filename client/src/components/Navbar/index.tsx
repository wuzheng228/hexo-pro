import React, { useState } from "react";
import styles from './style/index.module.less'
import Logo from '@/assets/logo.svg'
import { Avatar, Button, Dropdown, Input, MenuProps, Modal } from "antd";
import { DownOutlined, PoweroffOutlined } from "@ant-design/icons";
import useLocale from "@/hooks/useLocale";
import { useSelector } from "react-redux";
import { GlobalState } from "@/store";
import service from "@/utils/api";
import { parseDateTime } from "@/utils/dateTimeUtils";
import { useNavigate } from "react-router-dom";
import useStorage from "@/utils/useStorage";

export default function Navbar() {

    const navigate = useNavigate()

    const userInfo = useSelector((state: GlobalState) => {
        return state.userInfo
    });

    const locale = useLocale()
    const [_, setUserStatus] = useStorage('userStatus');

    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [target, setTarget] = useState('Post')

    const writeDropList: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <div>
                    写文章
                </div>
            ),
        },
        {
            key: '2',
            label: (
                <div>
                    新页面
                </div>
            ),
        }
    ];

    const settingDropList: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <div>
                    <PoweroffOutlined /> {locale['navbar.logout']}
                </div>
            ),
        }
    ]

    const handleCreateBlog: MenuProps['onClick'] = ({ key }) => {
        console.log('create blog')
        if (key === '1') {
            setOpen(true)
            setTarget('Post')
        } else if (key === '2') {
            console.log('create page')
            setOpen(true)
            setTarget('Page')
        }
    }

    const handleLogout: MenuProps['onClick'] = ({ key }) => {
        if (key === '1') {
            console.log('logout')
            setUserStatus('logout');
            window.location.href = '/pro/login';
        }
    }

    const onCancel = () => {
        setOpen(false)
    }

    const checkTitle = (title: string) => {
        if (!title || title.trim() === '' || title.length > 100) {
            return false
        }
        return true
    }

    const newPost = () => {
        if (!checkTitle(title)) {
            return
        }
        service.post('/hexopro/api/posts/new', { title: title }).then((res) => {
            const post = res.data
            post.date = parseDateTime(post.date)
            post.updated = parseDateTime(post.updated)
            navigate(`/post/${post._id}`);
        })
        setOpen(false)
    }

    function newPage() {
        if (!checkTitle(title)) return
        service.post('/hexopro/api/pages/new', { title: title }).then((res) => {
            const post = res.data
            post.date = parseDateTime(post.date)
            post.updated = parseDateTime(post.updated)
            navigate(`/page/${post._id}`);
        })
        setOpen(false)
    }

    const onSubmit = () => {
        console.log('submit', title)
        if (target === 'Post') {
            console.log('create article')
            newPost()
        } else if (target === 'Page') {
            console.log('create page')
            newPage()
        }
    }

    return (
        <div className={styles.navbar}>
            {/* 左侧 */}
            <div className={styles.left}>
                <div className={styles.logo}>
                    <Logo />
                    <div className={styles['logo-name']}>Hexo Pro</div>
                </div>
            </div>
            {/* 右侧 */}
            <ul className={styles.right}>
                <li >
                    <Dropdown menu={{ items: writeDropList, onClick: handleCreateBlog }}>
                        <Button type="primary">{locale['navbar.create']}<DownOutlined /></Button>
                    </Dropdown>
                </li>
                {
                    userInfo && <li>
                        <Dropdown menu={{ items: settingDropList, onClick: handleLogout }}>
                            <Avatar size={32} style={{ cursor: "pointer" }} src={userInfo.avatar} />
                        </Dropdown>
                    </li>
                }
            </ul>
            <Modal
                open={open}
                title={locale['navbar.modal.title']}
                onCancel={onCancel}
                footer={
                    [
                        <Button key="back" onClick={onCancel}>{locale['navbar.modal.cancel']}</Button>,
                        <Button key="submit" type="primary" onClick={onSubmit}>{locale['navbar.modal.submit']}</Button>,
                    ]
                }
            >
                <Input placeholder={locale['navbar.modal.input.placeholder']} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Modal>
        </div>
    )
}