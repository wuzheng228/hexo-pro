import React from 'react'
import './style/index.css'
import Logo from '../../assets/logo'
type person = {
    name: string
}
function Login() {
    return (
        <div className='container'>
            {/* Logo */}
            <div className='logo'>
                <Logo />
            </div>
            {/* banner */}
            <div className='banner'>

            </div>
            {/* content */}
            <div className='content'>
                {/* form */}

                {/* footer */}
            </div>
        </div>
    )
}

export default Login