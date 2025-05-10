

module.exports = {
    base64Decode: function base64Decode(base64) {
        return decodeURIComponent(escape(atob(base64)));
    }
}