import React from "react";
import { Footer as Foo } from 'antd/es/layout/layout'
import styles from './style/index.module.less'

export default function Footer() {
    return (
        <div>
            <Foo className={styles.footer}>Hexo pro</Foo>
        </div>
    )
}