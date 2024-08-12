
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
import { Button, Col, message, Popconfirm, Row } from 'antd'
import styles from '../../style/index.module.less';
import IconSort from '../../../../assets/sort.svg'
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import moment from 'moment'
import _ from 'lodash';
import { PostSettings } from './postSetting';
import { useNavigate } from "react-router-dom";
import { marked, MarkedExtension, Renderer, Tokens } from 'marked';
import { render } from 'react-dom';
import { BarsOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import HexoProVditor from '@/components/Vditor';


const ButtonGroup = Button.Group;

type Post = {
    isDraft: boolean
    source: string
}





function Post() {
    const navigate = useNavigate();
    const postRef = useRef(null);
    const { _id } = useParams();
    const [post, setPost] = useState({ isDraft: true, source: null });
    const [tagsCatMeta, setTagsCatMeta] = useState({})
    const [postMetaData, setPostMetadata] = useState({ tags: [], categories: [], frontMatter: {} })
    const [doc, setDoc] = useState('');
    const [title, setTitle] = useState('');
    const [initialRaw, setInitialRaw] = useState('');
    const [rendered, setRendered] = useState('');
    const [update, setUpdate] = useState({});
    const [visible, setVisible] = useState(false)
    const [lineNumber, setLineNumber] = useState(false)
    const [enableAutoStrol, setEnableAutoStroll] = useState(false)

    const queryPostById = (_id) => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/posts/' + _id).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const tagsCategoriesAndMetadata = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/tags-categories-and-metadata').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const postMeta = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/postMeta/' + _id).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const settings = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/settings/list').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const fetch = () => {
        return {
            post: queryPostById(_id),
            tagsCategoriesAndMetadata: tagsCategoriesAndMetadata(),
            settings: settings(),
            postMeta: postMeta()
        }
    }

    const dataDidLoad = (name, data) => {
        if (name == 'postMeta') {
            setPostMetadata(data)
            return
        }
        if (name == 'tagsCategoriesAndMetadata') {
            setTagsCatMeta(data)
            return
        }
        if (name == 'post') {
            // console.log('dataLoad', data)
            const parts = data.raw.split('---')
            const _slice = parts[0] === '' ? 2 : 1;
            const raw = parts.slice(_slice).join('---').trim();
            setTitle(data.title)
            setInitialRaw(raw)
            setRendered(raw)
            setPost(data)
        }
    }

    const handleChange = (update) => {
        console.log('update', update)
        // var now = moment()
        const promise = new Promise((resolve, reject) => {
            service.post('/hexopro/api/posts/' + _id, update).then((res) => {
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
        console.log(post.source)
        const parts = post.source.split('/')
        parts[parts.length - 1] = e.target.value + '.md'
        const newSource = parts.join('/')
        postRef.current({ title: e.target.value, source: newSource })
    }

    const handleChangeContent = (text) => {
        if (text === rendered) {
            return
        }
        setRendered(text)
        postRef.current({ _content: text })
    }

    const removeBlog = () => {
        const promise = new Promise((resolve, reject) => {
            service.get('/hexopro/api/posts/' + _id + '/remove').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
        if (post.isDraft) {
            navigate(`/posts/drafts`);
        } else {
            navigate(`/posts/blogs`);
        }
    }

    const publish = () => {
        const res = handlePublish()
        res.then((data: Post) => {
            setPost(data)
        }).catch(err => {
            console.log(err)
        })
    }

    const handlePublish = () => {
        if (!post.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            console.log('publish blog')
            service.post('/hexopro/api/posts/' + _id + '/publish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const unpublish = () => {
        const res = handleUnpublish()
        res.then((data: Post) => {
            setPost(data)
        }).catch(err => {
            console.log(err)
        })
    }

    const handleUnpublish = () => {
        if (post.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            console.log('unpublish blog')
            service.post('/hexopro/api/posts/' + _id + '/unpublish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const handleUpdate = (update) => {
        console.log(update)
        return new Promise((resolve, reject) => {
            service.post('/hexopro/api/posts/' + _id, update).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const handleUploadingImage = (isUploading: boolean) => {
        console.log('handleUploadingImage', isUploading)
    }

    useEffect(() => {
        queryPostById(_id).then((res) => {
            if (typeof res === 'object' && res != null && '_content' in res) {
                const content = (res as { _content: string })._content;
                setDoc(content)
            }
        }).catch(err => {
            setDoc(err)
        })
    }, [])

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

    return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: 'blue' }}>
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
                    <Col span={4} offset={7} style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 20 }}>
                        <ButtonGroup>
                            <Button type={!enableAutoStrol ? 'dashed' : 'default'} icon={<IconSort />} onClick={() => setEnableAutoStroll(!enableAutoStrol)} />
                            <Button type={!lineNumber ? 'dashed' : 'default'} icon={<BarsOutlined />} onClick={() => setLineNumber(!lineNumber)} />
                            <Button type='default' icon={<SettingOutlined />} onClick={() => setVisible(true)} />
                            {
                                post.isDraft ?
                                    <Button type='primary' onClick={publish}>发布博客</Button>
                                    : <Button type='default' onClick={unpublish}>转为草稿</Button>
                            }
                        </ButtonGroup>
                    </Col>
                    <Col span={1}>
                        <Popconfirm
                            title='确认删除'
                            description='确认删除博客吗?'
                            onConfirm={() => {
                                message.info({
                                    content: 'ok',
                                });
                                removeBlog()
                            }}
                            onCancel={() => {
                                message.error({
                                    content: 'cancel',
                                });
                            }}
                        >
                            <Button type='default' icon={<DeleteOutlined />} disabled={!post.isDraft} />
                        </Popconfirm>
                    </Col>
                </Row>
            </div>
            <div style={{ backgroundColor: 'red', width: "100%", flex: 1, padding: 0, border: 'none' }}>
                <HexoProVditor handleChangeContent={handleChangeContent} handleUploadingImage={handleUploadingImage} />
            </div>
            <PostSettings
                visible={visible}
                setVisible={setVisible}
                tagCatMeta={tagsCatMeta}
                setTagCatMeta={setTagsCatMeta}
                postMeta={postMetaData}
                setPostMeta={setPostMetadata}
                handleChange={handleChange}
            />
        </div >
    )
}

export default Post