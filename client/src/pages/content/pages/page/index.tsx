
import MarkDownEditor from '@/components/markdownEditor';
import { service } from '@/utils/api';
import React, { useEffect, useRef, useState, createElement, Fragment, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
// import remarkParse from 'remark-parse'
// import remarkRehype from 'remark-rehype'
// import remarkGfm from 'remark-gfm'
// import rehypeFormat from 'rehype-format'
// import rehypeHighlight from 'rehype-highlight'
// import rehypeReact from 'rehype-react';
// import { remark } from 'remark';
import styles from '../../style/index.module.less';
import 'highlight.js/styles/github.css';
import IconSort from '../../../../assets/sort.svg'
import _ from 'lodash';
import { PageSettings } from './pageSettings';
import { useNavigate } from "react-router-dom";
import { marked } from 'marked';
import { Button, Col, message, Popconfirm, Row } from 'antd';
import { BarsOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import ButtonGroup from 'antd/es/button/button-group';


type Page = {
    isDraft: boolean
    isDiscarded: boolean
    source: string
}

function Page() {
    const navigate = useNavigate();
    const postRef = useRef(null);
    const { _id } = useParams();
    const [page, setPage] = useState({ isDraft: true, source: null });
    const [pageMetaData, setPageMetadata] = useState({ tags: [], categories: [], frontMatter: {}, source: '' })
    const [fmtKeys, setFmtKeys] = useState([])
    const [doc, setDoc] = useState('');
    const [title, setTitle] = useState('');
    const [initialRaw, setInitialRaw] = useState('');
    // const [rendered, setRendered] = useState('');
    const [update, setUpdate] = useState({});
    const [visible, setVisible] = useState(false)
    const [lineNumber, setLineNumber] = useState(false)
    const [enableAutoStroll, setEnableAutoStroll] = useState(false)

    const queryPageById = (_id) => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/pages/' + _id).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const postMeta = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/pageMeta/' + _id).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const fetch = () => {
        return {
            page: queryPageById(_id),
            pageMeta: postMeta()
        }
    }

    const dataDidLoad = (name, data) => {
        if (name == 'pageMeta') {
            setPageMetadata(data)
            setFmtKeys(Object.keys(data.frontMatter))
            return
        }

        if (name == 'page') {
            // console.log('dataLoad', data)
            const parts = data.raw.split('---')
            const _slice = parts[0] === '' ? 2 : 1;
            const raw = parts.slice(_slice).join('---').trim();
            setTitle(data.title)
            setInitialRaw(raw)
            // setRendered(raw)
            setPage(data)
            const content = (data)._content;
            setDoc(content)
        }
    }

    const handleChange = (update) => {
        // var now = moment()
        const promise = new Promise((resolve, reject) => {
            service.post('/hexopro/api/pages/' + _id, update).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
        return promise
    }

    const handleChangeTitle = (e) => {
        if (e.target.value == title) {
            return
        }
        setTitle(e.target.value)
        postRef.current({ title: e.target.value })
    }

    const handleChangeContent = (text) => {
        // if (text === rendered) {
        //     return
        // }
        // setRendered(text)
        postRef.current({ _content: text })
    }

    const removePage = () => {
        const promise = new Promise((resolve, reject) => {
            service.get('/hexopro/api/pages/' + _id + '/remove').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
        navigate(`/pages`);
    }

    const publish = () => {
        const res = handlePublish()
        res.then((data: Page) => {
            setPage(data)
        }).catch(err => {
            console.log(err)
        })
    }

    const handlePublish = () => {
        if (!page.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            console.log('publish blog')
            service.post('/hexopro/api/pages/' + _id + '/publish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const unpublish = () => {
        const res = handleUnpublish()
        res.then((data: Page) => {
            setPage(data)
        }).catch(err => {
            console.log(err)
        })
    }

    const handleUnpublish = () => {
        if (page.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            console.log('unpublish blog')
            service.post('/hexopro/api/pages/' + _id + '/unpublish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const handleUpdate = (update) => {
        return new Promise((resolve, reject) => {
            service.post('/hexopro/api/pages/' + _id, update).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }


    useEffect(() => {
        const items = fetch()
        Object.keys(items).forEach((name) => {
            Promise.resolve(items[name]).then((data) => {
                const update = {}
                update[name] = data
                setUpdate(update)
                if (dataDidLoad) {
                    dataDidLoad(name, data)
                }
            })
        })
    }, [])

    useEffect(() => {
        const p = _.debounce((update) => {
            handleUpdate(update)
        }, 1000, { trailing: true, loading: true });
        postRef.current = p
    }, []);

    // const [editorRef, editorView] = MarkDownEditor({ initialValue: doc, adminSettings: { editor: { lineNumbers: true } }, setRendered, handleChangeContent, handleScroll, forceLineNumbers: lineNumber })
    return (
        <div>
            <Row style={{ width: "100%", borderBottomColor: 'black', borderBottom: '1px solid gray', backgroundColor: 'white' }} align='middle'>
                {/* 博客名称输入 */}
                <Col span={12}>
                    <input
                        style={{ width: "100%", height: 60, border: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 28, fontWeight: 500, marginLeft: 10 }}
                        value={title}
                        onChange={(v) => handleChangeTitle(v)}
                    />
                </Col>
                {/* 博客发布按钮 */}
                <Col span={2} offset={9} style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 50 }}>
                    <ButtonGroup>
                        <Button type={!enableAutoStroll ? 'dashed' : 'default'} icon={<IconSort />} onClick={() => {
                            console.log(enableAutoStroll)
                            if (enableAutoStroll) {
                                setEnableAutoStroll(false)
                            } else {
                                setEnableAutoStroll(true)
                            }
                        }} />
                        <Button type='default' icon={<BarsOutlined />} onClick={() => setLineNumber(!lineNumber)} />
                        <Button type='default' icon={<SettingOutlined />} onClick={() => setVisible(true)} />
                    </ButtonGroup>
                </Col>
                <Col span={1} >
                    <Popconfirm
                        title='确认删除'
                        description='确认删除页面吗?'
                        onConfirm={() => {
                            message.info({
                                content: 'ok',
                            });
                            removePage()
                        }}
                        onCancel={() => {
                            message.error({
                                content: 'cancel',
                            });
                        }}
                    >
                        <Button type='default' icon={<DeleteOutlined />} />
                    </Popconfirm>

                </Col>
            </Row>
            <Row style={{ boxSizing: 'border-box', margin: 0, backgroundColor: 'white', height: "100vh", overflow: 'hidden', width: "100%" }}>
                <MarkDownEditor initialValue={doc} adminSettings={{ editor: { lineNumbers: true } }} handleChangeContent={handleChangeContent} enableAutoStroll={enableAutoStroll} forceLineNumbers={lineNumber} />
            </Row>
            <PageSettings
                visible={visible}
                setVisible={setVisible}
                pageMeta={pageMetaData}
                setPageMeta={setPageMetadata}
                handleChange={handleChange}
            />
        </div >
    )
}

export default Page