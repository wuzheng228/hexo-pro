import React, { useEffect, useState } from "react";
import { post } from "@/utils/api";
import { Button, Col, Input, message, Modal, Row, Space, Tag, Tooltip } from "antd";
import { FrontMatterAdder } from "../../components/frontMatterAdder";

export function PageSettings({ visible, setVisible, pageMeta, setPageMeta, handleChange }) {
    // 添加使用的状态
    const [fmOpenStat, setFmOpenStat] = useState(false)
    const [originFms, setOriginFms] = useState([])

    const fmtClose = (v) => {
        const newfmt = {}
        Object.keys(pageMeta.frontMatter).forEach(key => {
            if (key === v) {
                return
            }
            newfmt[key] = pageMeta.frontMatter[key]
        })
        const meta = { ...pageMeta, frontMatter: newfmt }
        setPageMeta(meta)
    }

    function isPathValid(path) {
        // 匹配以.md为扩展名的文件名，并且路径只包含合法字符（字母、数字、斜杠、下划线和短横线）
        const regex = /^([a-zA-Z0-9-_\/]+)\/([a-zA-Z0-9-_]+\.md)$/i; // i标志表示不区分大小写
        return regex.test(path);
    }

    return (
        <Modal
            title={
                <div style={{ textAlign: 'left' }}>
                    文章属性
                </div>
            }
            visible={visible}
            onCancel={() => {
                setPageMeta({ ...pageMeta, tags: [], categories: [], frontMatter: originFms });
                setVisible(false);
            }}
            onOk={() => {
                if (!isPathValid(pageMeta.source)) {
                    message.error('配置的页面路径非法请检查！')
                } else {
                    setVisible(false);
                    handleChange({ frontMatter: pageMeta.frontMatter, source: pageMeta.source })
                }
            }}
            afterOpenChange={() => {
                setOriginFms(pageMeta.frontMatter);
            }}
            style={{ width: 800 }}
        >
            <Row style={{ marginTop: 15, marginBottom: 15 }}>
                <Col>
                    <Space style={{ width: '100', flexWrap: 'wrap' }}>
                        {
                            /* 遍历渲染已有的fontMatter */
                            Object.keys(pageMeta.frontMatter).map((item) => {
                                return (
                                    <Tooltip key={item} title={!pageMeta.frontMatter[item] ? 'unset' : pageMeta.frontMatter[item]}>
                                        <Tag closable onClose={() => fmtClose(item)} key={item} color="blue" style={{ marginBottom: 5 }}>{item}</Tag>
                                    </Tooltip>

                                )
                            })
                        }
                        <Button type='dashed'
                            onClick={() => {
                                setFmOpenStat(!fmOpenStat)
                            }}
                        >+自定义frontMatter</Button>
                    </Space>

                    {
                        /* todo 打开添加标签的界面 */
                        <FrontMatterAdder existFrontMatter={originFms} onClose={() => { setFmOpenStat(false) }} visible={fmOpenStat} title={'Font-Matter'} frontMatter={pageMeta.frontMatter} onChange={
                            (v) => {
                                const meta = { ...pageMeta, frontMatter: v }
                                setPageMeta(meta)
                            }
                        } />
                    }
                </Col>
            </Row>
            <Row style={{ marginTop: 15, marginBottom: 15 }}>
                <Col>
                    <Input style={{ width: 350 }} allowClear placeholder='请输入页面存放路径' value={pageMeta.source} onChange={(v) => {
                        const newMeta = { ...pageMeta, source: v }
                        setPageMeta(newMeta)
                    }} />
                </Col>
            </Row>
        </Modal>
    )
}