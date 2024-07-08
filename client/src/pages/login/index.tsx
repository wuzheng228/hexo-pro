import React from 'react'
import styles from './style/index.module.less'
import Logo from '../../assets/logo.svg'
import LoginBanner from './banner'
import LoginForm from './form'

function Login() {
    console.log(styles)
    return (
        <div className={styles.container}>

            <div className={styles.logo}>
                <Logo />
            </div>
            {/* banner */}
            <div className={styles.banner}>
                <LoginBanner />
            </div>
            {/* content */}
            <div className={styles.content}>
                {/* form */}
                <LoginForm />
                {/* footer */}
            </div>
        </div>
    )
}

export default Login