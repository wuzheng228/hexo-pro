import { Button, Image, Space, Table, TableProps } from "antd";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import service from "@/utils/api";


interface DataType {
    key: string;
    _id: string;
    cover: string;
    title: string;
    permalink: string;
    date: string;
    updated: string;
    option: string
}

const columns: TableProps<DataType>['columns'] = [
    {
        key: 'cover',
        title: '封面',
        dataIndex: 'cover',
        render: (col, item, index) => {
            return (<Image width={64} height={42.56} src={item.cover} />)
        }
    },
    {
        key: 'title',
        title: '博客名称',
        dataIndex: 'title',
    },
    {
        key: 'permalink',
        title: '链接',
        dataIndex: 'permalink',
        render: (col, item, index) => {
            return (<a href={decodeURIComponent(item.permalink)} target='_blank'>{decodeURIComponent(item.permalink)}</a>)
        }
    },
    {
        key: 'date',
        title: '发布时间',
        dataIndex: 'date',
    },
    {
        key: 'updated',
        title: '更新时间',
        dataIndex: 'updated',
    },
    {
        key: 'option',
        title: '操作',
        dataIndex: 'option',
        render: (col, item, index) => {
            return (
                <Space>
                    <Link to={`/post/${item._id}`}>
                        <Button type='primary' >编辑</Button>
                    </Link>
                </Space>

            )
        }
    }
]

function ArticleList({ published }) {

    const [postList, setPostList] = useState([])

    const queryPosts = () => {
        service.get('/hexopro/api/posts/list?published=' + published)
            .then(res => {
                const result = res.data.map((obj, i) => {
                    return { _id: obj._id, title: obj.title, cover: obj.cover, date: obj.date, permalink: obj.permalink, updated: obj.updated, key: i + 1 }
                });
                setPostList(result)
            })
    }

    useEffect(() => {
        queryPosts()
    }, [])

    return (
        <Table dataSource={postList} columns={columns} />
    )
}

export default ArticleList