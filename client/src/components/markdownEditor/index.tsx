import React, { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Col, Row } from 'antd'
// import { history, historyKeymap } from '@codemirror/history';
import { syntaxHighlighting } from "@codemirror/language";
import {
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
} from '@codemirror/view';
import { EditorState, Compartment, StateCommand } from '@codemirror/state';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { ayuLight } from 'thememirror';
import { defaultKeymap, indentMore, indentLess } from "@codemirror/commands"
import service from '@/utils/api';
import Styles from './style/index.module.less'
import { MarkedExtension, Tokens, marked } from 'marked';
import hljs from 'highlight.js';

const markdownHighlighting = HighlightStyle.define(
    [
        {
            tag: tags.heading1,
            fontSize: "1.6em",
            fontWeight: "bold"
        },
        {
            tag: tags.heading2,
            fontSize: "1.4em",
            fontWeight: "bold",
        },
        {
            tag: tags.heading3,
            fontSize: "1.2em",
            fontWeight: "bold",
        },
    ]
)

function MarkdownEditor({ initialValue, adminSettings, handleChangeContent, enableAutoStroll, forceLineNumbers }) {

    const editorRef = useRef(null)
    const mouseIsOn = useRef(null);
    const previewRef = useRef(null)
    const [md, setRenderedMarkdown] = useState('');
    const [rendered, setRendered] = useState('');

    const handleScroll = (percent) => {
        if (enableAutoStroll) {
            const ele = previewRef.current
            const height = ele.getBoundingClientRect().height
            ele.scrollTop = (ele.scrollHeight - height) * percent
        }
    }

    function findScrollContainer(node: HTMLElement) {
        for (let cur: any = node; cur;) {
            if (cur.scrollHeight <= cur.clientHeight) {
                cur = cur.parentNode
                continue
            }
            return cur
        }
    }

    function uploadImage(image, filename) {
        const promise = new Promise((f, r) => {
            service.post('/hexopro/api/images/upload', { data: image, filename: filename }).then(res => {
                // console.log('image upload resp', res)
                f(res.data)
            })
        })
        return promise
    }

    const [editorView, setEditorView] = useState(null)
    const [lineNumberCptState, setLineNumberCpt] = useState(null)
    const [domEventHandlersState, setdomEventHandlers] = useState(null)

    useEffect(() => {
        if (!editorRef) return
        const lineNumberCpt = new Compartment();
        const domEventHandlers = new Compartment();

        const startState = EditorState.create({
            doc: initialValue,
            extensions: [
                EditorView.lineWrapping,
                ayuLight,
                keymap.of([
                    ...defaultKeymap,
                    {
                        key: "Tab",
                        preventDefault: true,
                        run: indentMore,
                    },
                    {
                        key: "Shift-Tab",
                        preventDefault: true,
                        run: indentLess,
                    },]),
                lineNumberCpt.of([lineNumbers(), basicSetup, EditorView.lineWrapping]),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                syntaxHighlighting(markdownHighlighting),
                markdown({ base: markdownLanguage }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        setRendered(update.state.doc.toString());
                        handleChangeContent(update.state.doc.toString())
                    }
                }),
                domEventHandlers.of(EditorView.domEventHandlers({
                    scroll(event, view) {
                        console.log(enableAutoStroll)
                        handleScroll(editorRef.current.scrollTop / editorRef.current.scrollHeight)
                    },
                    paste(event, view) {
                        // console.log(event)
                        // console.log(view)
                        const items = (event.clipboardData).items;
                        if (!items.length) return
                        let blob;
                        for (let i = items.length - 1; i >= 0; i--) {
                            if (items[i].kind == 'file') {
                                blob = items[i].getAsFile();
                                break;
                            }
                        }
                        if (!blob) return
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const filename = null;
                            uploadImage(event.target.result, filename).then((res: { src: string, msg: string }) => {
                                // console.log(res)
                                const transaction = view.state.replaceSelection(`\n![${res.msg}](${res.src})`)
                                view.update([view.state.update(transaction)])
                            });
                        };
                        reader.readAsDataURL(blob);
                    }
                }))
            ],
        })

        const view = new EditorView({
            parent: editorRef.current,
            state: startState,
        });

        setEditorView(view)
        setLineNumberCpt(lineNumberCpt)
        setdomEventHandlers(domEventHandlers)
        return () => view.destroy()
    }, [editorRef]);

    useEffect(() => {
        if (!editorView || !lineNumberCptState) {
            return
        }
        if (forceLineNumbers) {
            editorView.dispatch({
                effects: lineNumberCptState.reconfigure([lineNumbers(), basicSetup, EditorView.lineWrapping])
            })
        } else {
            editorView.dispatch({
                effects: lineNumberCptState.reconfigure([])
            })
        }
    }, [editorView, forceLineNumbers])

    useEffect(() => {
        if (!editorView || !initialValue) {
            return
        }
        const transaction = editorView.state.update({
            changes: {
                from: 0,
                to: editorView.state.doc.length,
                insert: initialValue,
            },
            selection: editorView.state.selection,
        })

        editorView.dispatch(transaction)

    }, [initialValue, editorView])


    useEffect(() => {
        const renderer: MarkedExtension = {
            renderer: {
                code: ({ text, lang, escaped }: Tokens.Code) => {
                    if (!text) return ''
                    console.log('render', text)
                    const validLanguage = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return `<pre><code>${hljs.highlight(text, { language: validLanguage }).value}</code></pre>`
                }
            }
        };

        marked.use(renderer);
        marked.use({
            pedantic: false,
            gfm: true,
            breaks: true
        });

        const renderMarkdown = async () => {
            const parsedMarkdown = await marked.parse(rendered);
            setRenderedMarkdown(parsedMarkdown);
        };

        renderMarkdown()
    }, [rendered])

    useEffect(() => {
        if (!editorView) return;

        const transaction = editorView.state.update({
            effects: domEventHandlersState.reconfigure(EditorView.domEventHandlers({
                scroll(event, view) {
                    handleScroll(editorRef.current.scrollTop / editorRef.current.scrollHeight)
                },
                paste(event, view) {
                    // console.log(event)
                    // console.log(view)
                    const items = (event.clipboardData).items;
                    if (!items.length) return
                    let blob;
                    for (let i = items.length - 1; i >= 0; i--) {
                        if (items[i].kind == 'file') {
                            blob = items[i].getAsFile();
                            break;
                        }
                    }
                    if (!blob) return
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const filename = null;
                        uploadImage(event.target.result, filename).then((res: { src: string, msg: string }) => {
                            // console.log(res)
                            const transaction = view.state.replaceSelection(`\n![${res.msg}](${res.src})`)
                            view.update([view.state.update(transaction)])
                        });
                    };
                    reader.readAsDataURL(blob);
                }
            }))
        })

        // 更新 EditorView
        editorView.dispatch(transaction);
    }, [editorView, enableAutoStroll]);

    return (

        <div style={{ width: "100%", height: '100vh' }}>
            <Row className={Styles.editorWrapper} >
                <Col
                    id={'markdown'}
                    span={12}
                    // onScroll={handleMarkdownScroll}
                    className={Styles.markdown}
                    ref={editorRef}
                    onMouseEnter={() => (mouseIsOn.current = 'markdown')}
                />
                <Col
                    id={'preview'}
                    span={12}
                    ref={previewRef}
                    className={Styles.preview}
                    style={{ overflowY: 'scroll' }}
                    // onScroll={handlePreviewScroll}
                    onMouseEnter={() => (mouseIsOn.current = 'preview')}
                    dangerouslySetInnerHTML={{ __html: md }}
                ></Col>
            </Row>

        </div>
    )
}

export default MarkdownEditor