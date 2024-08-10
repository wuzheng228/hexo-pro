import axios from "axios"

const service = axios.create()

service.interceptors.request.use(config => {
    // 在这里可以为每个请求添加请求头
    // if (localStorage.getItem('hexoProToken'))
    config.headers['Authorization'] = 'Bearer ' + localStorage.getItem('hexoProToken')
    return config;
});
service.interceptors.response.use((resp) => {
    if (resp.data && resp.data.code && resp.data.code == 401) {
        window.location.pathname = '/pro/login';
        localStorage.removeItem('userStatus')
    }
    return resp
}, err => {
    return Promise.reject(err)
})

const post = (url, data, config) => {
    return new Promise((f, r) => {
        service.post(url, data, config).then(res => {
            f(res)
        })
    })
}

const get = (url, config) => {
    return new Promise((f, r) => {
        service.get(url, config).then(res => {
            f(res)
        })
    })
}


export default service

export { service, get, post }