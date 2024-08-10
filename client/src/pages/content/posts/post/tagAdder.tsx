import { Button, Card, Checkbox, Input, Space, Tag } from "antd";
import React, { useEffect, useState } from "react"

const CheckboxGroup = Checkbox.Group

export function TagAdder({ existTags, tags, onchange, onClose, visible, cardTitle, placeholder }) {

    const [tagInputValue, setTagInputValue] = useState('')
    const [localVisible, setLocalVisible] = useState(visible)

    useEffect(() => {
        // 当外部的 visible 发生变化时，同步更新本地的状态
        setLocalVisible(visible);
    }, [visible]);

    const addNewTag = (v) => {
        const inputValue = v.target.value
        if (inputValue.trim() == '') {
            setTagInputValue('')
            return
        }
        const tagSet = new Set(tags)
        tagSet.add(inputValue)
        onchange(Array.from(tagSet))
        setTagInputValue('')
    }


    function tagModified() {
        const options = []
        Object.keys(existTags).forEach((name) => {
            options.push(existTags[name])
        })
        return (
            <CheckboxGroup
                options={options.map((item, i) => ({
                    label: (
                        <Tag color={tags.includes(item) ? 'purple' : ''} style={{ marginBottom: 5 }}>
                            {item}
                        </Tag>
                    ),
                    value: item
                }))}
                value={tags}
                onChange={(v) => { onchange(v) }}
            />
        )
    }

    function addTag() {
        return (
            <div style={{ width: '100%', display: 'flex' }}>
                <Input
                    style={{ flex: 1 }}
                    placeholder={placeholder}
                    value={tagInputValue}
                    onChange={(v) => setTagInputValue(v.target.value)}
                    onPressEnter={(v) => { addNewTag(v) }}
                />
                <Button
                    type="default"
                    style={{ marginLeft: '5px' }}
                    onClick={() => {
                        setLocalVisible(!visible)
                        onClose()
                    }}
                >
                    X
                </Button>
            </div>
        )
    }

    return (
        localVisible &&
        <Card
            title={cardTitle}
            bordered={true}
            hoverable={true}
            style={{ position: 'absolute', zIndex: 999, width: '350px' }}
            extra={addTag()}
        >
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {tagModified()}
            </div>
        </Card>
    )
}