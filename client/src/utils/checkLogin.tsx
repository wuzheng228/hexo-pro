export default function checkLogin() {
  return localStorage.getItem('userStatus') === 'login' || localStorage.getItem('userStatus') === 'unsafe';
}
