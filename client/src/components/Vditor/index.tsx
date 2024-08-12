import React, { useEffect, useRef, useState } from 'react';

import Vditor from 'vditor';
import "vditor/src/assets/less/index.less"
import "./style/index.less"
import service from '@/utils/api';

export default function HexoProVditor({ handleChangeContent, handleUploadingImage }) {

    // 'emoji', 'headings', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'undo', 'redo', 'upload', 'link', 'table', 'edit-mode', 'preview', 'fullscreen', 'outline', 'export'

    function uploadImage(image, filename) {
        const promise = new Promise((f, r) => {
            service.post('/hexopro/api/images/upload', { data: image, filename: filename }).then(res => {
                // console.log('image upload resp', res)
                f(res.data)
            }).catch(err => {
                r(err)
            })
        })
        return promise
    }


    const [vd, setVd] = useState(undefined);
    const [isUploadingImage, setIsUPloadingImage] = useState(false)

    const [isEditorFocus, setIsEditorFocus] = useState(false)


    useEffect(() => {
        handleUploadingImage(isUploadingImage)
        return () => {
            setIsUPloadingImage(undefined)
        }
    }, [isUploadingImage])


    useEffect(() => {
        const vditor = new Vditor('vditor', {
            theme: 'classic',
            height: '100%',
            width: '100%',
            toolbarConfig: {
                pin: true // 确保工具栏固定
            },
            after: () => {
                // const vditorElement = document.querySelector('#vditor > div.vditor-content > div.vditor-ir > pre');
                // console.log(vditorElement)
                // if (vditorElement) {
                //     vditorElement.addEventListener('focus', () => {
                //         console.log('Vditor 编辑器已获得焦点1');
                //     }, true);
                //     vditorElement.addEventListener('blur', () => {
                //         console.log('Vditor 编辑器失去焦点');
                //     }, true);
                // }
            },
            focus: (v: string) => {
                setIsEditorFocus(true)
            },
            blur: (v) => {
                setIsEditorFocus(false)
            },
            upload: {
                multiple: false,
                error: (err: any) => {
                    console.log('err', err)
                },
                validate: (files) => {
                    console.log('validate', files)
                    return true
                },
                format: (files: File[], responseText: string): string => {
                    // 这里可以添加处理文件格式化的逻辑
                    console.log('format', files)
                    return responseText;
                },
                file: (files: File[]): File[] | Promise<File[]> => {
                    console.log('file', files)
                    return null
                },
                handler: (files: File[]): Promise<string | null> => {
                    // 这里可以添加处理文件上传的逻辑
                    console.log(files)
                    for (let file of files) {
                        setIsUPloadingImage(true)
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const filename = file.name;
                            uploadImage(event.target.result, filename).then((res: { src: string, msg: string }) => {
                                console.log('update=> ', res)
                                res['code'] = 0

                                let ans = {
                                    "msg": res.msg,
                                    "code": 0,
                                    "data": {
                                        "errFiles": [],
                                        "succMap": {
                                            filename: res.src,
                                        }
                                    }
                                }
                                setTimeout(() => {
                                    const currentValue = vditor.getValue();
                                    const cursorPosition = vditor.getCursorPosition();
                                    console.log('cursorPosition', cursorPosition)
                                    if (isEditorFocus) {
                                        vditor.setValue(currentValue + `\n![alt text](${res.src})`)
                                    } else {
                                        vditor.insertValue(`\n![alt text](${res.src})`)
                                    }
                                    // 重新渲染编辑器内容（如果需要）
                                }, 300);
                                return null
                            }).catch((err) => {
                                console.error('Image upload failed: ', err);
                                return err
                            }).finally(() => {
                                setIsUPloadingImage(false)
                            });
                        };
                        reader.readAsDataURL(file);
                    }
                    return null; // 确保函数返回一个值
                }
            },
            input: (v) => {
                handleChangeContent(vditor.getValue())
            },
            toolbar: [
                {
                    name: 'emoji'
                },
                {
                    name: 'headings'
                },
                {
                    name: 'bold'
                },
                {
                    name: 'italic'
                },
                {
                    name: 'strike'
                },
                {
                    name: 'line'
                },
                {
                    name: 'quote'
                },
                {
                    name: 'list'
                },
                {
                    name: 'ordered-list'
                },
                {
                    name: 'check'
                },
                {
                    name: 'outdent'
                },
                {
                    name: 'indent'
                },
                {
                    name: 'code'
                },
                {
                    name: 'inline-code'
                },
                {
                    name: 'inline-code'
                },
                {
                    name: 'insert-after'
                },
                {
                    name: 'insert-before'
                },
                {
                    name: 'undo'
                },
                {
                    name: 'redo'
                },
                {
                    name: 'upload'
                },
                {
                    name: 'link'
                },
                {
                    name: 'table'
                },
                {
                    name: 'edit-mode',
                },
                {
                    name: 'preview',
                    className: 'toolbar-right'
                },
                {
                    name: 'fullscreen',
                    className: 'toolbar-right'
                },
                {
                    name: 'outline',
                    className: 'toolbar-right'
                },
                {
                    name: 'export',
                    className: 'toolbar-right'
                }
            ]
        });
        return () => {
            vd?.destroy();
            setVd(undefined);
        }
    }, []);
    return (
        <div style={{ width: '100%', height: '100%', flex: 1, backgroundColor: 'blue', borderRadius: '0px' }}>
            <div
                style={{ width: '100%', height: '100%' }}
                id='vditor'
                className='vditor'>
            </div>
        </div >

    )
}