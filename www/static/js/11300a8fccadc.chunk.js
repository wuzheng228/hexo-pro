/*! For license information please see 11300a8fccadc.chunk.js.LICENSE.txt */
"use strict";(self.webpackChunkhexo_pro_client=self.webpackChunkhexo_pro_client||[]).push([[113],{5209:(t,e,r)=>{r.r(e),r.d(e,{default:()=>x});var n=r(1923),o=r(6540),i=r(7767),a=r(2543),c=r.n(a),u=r(819),l=r(6579),f=r(9641),s=r(6510),h=r(9140),p=r(6874),y=r(1448),v=r(8430);function d(t){return d="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},d(t)}function m(t,e){var r=Object.keys(t);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(t);e&&(n=n.filter((function(e){return Object.getOwnPropertyDescriptor(t,e).enumerable}))),r.push.apply(r,n)}return r}function g(t){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?m(Object(r),!0).forEach((function(e){b(t,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(r)):m(Object(r)).forEach((function(e){Object.defineProperty(t,e,Object.getOwnPropertyDescriptor(r,e))}))}return t}function b(t,e,r){return(e=function(t){var e=function(t,e){if("object"!=d(t)||!t)return t;var r=t[Symbol.toPrimitive];if(void 0!==r){var n=r.call(t,e||"default");if("object"!=d(n))return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===e?String:Number)(t)}(t,"string");return"symbol"==d(e)?e:e+""}(e))in t?Object.defineProperty(t,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):t[e]=r,t}function w(){w=function(){return e};var t,e={},r=Object.prototype,n=r.hasOwnProperty,o=Object.defineProperty||function(t,e,r){t[e]=r.value},i="function"==typeof Symbol?Symbol:{},a=i.iterator||"@@iterator",c=i.asyncIterator||"@@asyncIterator",u=i.toStringTag||"@@toStringTag";function l(t,e,r){return Object.defineProperty(t,e,{value:r,enumerable:!0,configurable:!0,writable:!0}),t[e]}try{l({},"")}catch(t){l=function(t,e,r){return t[e]=r}}function f(t,e,r,n){var i=e&&e.prototype instanceof g?e:g,a=Object.create(i.prototype),c=new C(n||[]);return o(a,"_invoke",{value:L(t,r,c)}),a}function s(t,e,r){try{return{type:"normal",arg:t.call(e,r)}}catch(t){return{type:"throw",arg:t}}}e.wrap=f;var h="suspendedStart",p="suspendedYield",y="executing",v="completed",m={};function g(){}function b(){}function O(){}var E={};l(E,a,(function(){return this}));var j=Object.getPrototypeOf,S=j&&j(j(T([])));S&&S!==r&&n.call(S,a)&&(E=S);var x=O.prototype=g.prototype=Object.create(E);function P(t){["next","throw","return"].forEach((function(e){l(t,e,(function(t){return this._invoke(e,t)}))}))}function A(t,e){function r(o,i,a,c){var u=s(t[o],t,i);if("throw"!==u.type){var l=u.arg,f=l.value;return f&&"object"==d(f)&&n.call(f,"__await")?e.resolve(f.__await).then((function(t){r("next",t,a,c)}),(function(t){r("throw",t,a,c)})):e.resolve(f).then((function(t){l.value=t,a(l)}),(function(t){return r("throw",t,a,c)}))}c(u.arg)}var i;o(this,"_invoke",{value:function(t,n){function o(){return new e((function(e,o){r(t,n,e,o)}))}return i=i?i.then(o,o):o()}})}function L(e,r,n){var o=h;return function(i,a){if(o===y)throw Error("Generator is already running");if(o===v){if("throw"===i)throw a;return{value:t,done:!0}}for(n.method=i,n.arg=a;;){var c=n.delegate;if(c){var u=k(c,n);if(u){if(u===m)continue;return u}}if("next"===n.method)n.sent=n._sent=n.arg;else if("throw"===n.method){if(o===h)throw o=v,n.arg;n.dispatchException(n.arg)}else"return"===n.method&&n.abrupt("return",n.arg);o=y;var l=s(e,r,n);if("normal"===l.type){if(o=n.done?v:p,l.arg===m)continue;return{value:l.arg,done:n.done}}"throw"===l.type&&(o=v,n.method="throw",n.arg=l.arg)}}}function k(e,r){var n=r.method,o=e.iterator[n];if(o===t)return r.delegate=null,"throw"===n&&e.iterator.return&&(r.method="return",r.arg=t,k(e,r),"throw"===r.method)||"return"!==n&&(r.method="throw",r.arg=new TypeError("The iterator does not provide a '"+n+"' method")),m;var i=s(o,e.iterator,r.arg);if("throw"===i.type)return r.method="throw",r.arg=i.arg,r.delegate=null,m;var a=i.arg;return a?a.done?(r[e.resultName]=a.value,r.next=e.nextLoc,"return"!==r.method&&(r.method="next",r.arg=t),r.delegate=null,m):a:(r.method="throw",r.arg=new TypeError("iterator result is not an object"),r.delegate=null,m)}function M(t){var e={tryLoc:t[0]};1 in t&&(e.catchLoc=t[1]),2 in t&&(e.finallyLoc=t[2],e.afterLoc=t[3]),this.tryEntries.push(e)}function _(t){var e=t.completion||{};e.type="normal",delete e.arg,t.completion=e}function C(t){this.tryEntries=[{tryLoc:"root"}],t.forEach(M,this),this.reset(!0)}function T(e){if(e||""===e){var r=e[a];if(r)return r.call(e);if("function"==typeof e.next)return e;if(!isNaN(e.length)){var o=-1,i=function r(){for(;++o<e.length;)if(n.call(e,o))return r.value=e[o],r.done=!1,r;return r.value=t,r.done=!0,r};return i.next=i}}throw new TypeError(d(e)+" is not iterable")}return b.prototype=O,o(x,"constructor",{value:O,configurable:!0}),o(O,"constructor",{value:b,configurable:!0}),b.displayName=l(O,u,"GeneratorFunction"),e.isGeneratorFunction=function(t){var e="function"==typeof t&&t.constructor;return!!e&&(e===b||"GeneratorFunction"===(e.displayName||e.name))},e.mark=function(t){return Object.setPrototypeOf?Object.setPrototypeOf(t,O):(t.__proto__=O,l(t,u,"GeneratorFunction")),t.prototype=Object.create(x),t},e.awrap=function(t){return{__await:t}},P(A.prototype),l(A.prototype,c,(function(){return this})),e.AsyncIterator=A,e.async=function(t,r,n,o,i){void 0===i&&(i=Promise);var a=new A(f(t,r,n,o),i);return e.isGeneratorFunction(r)?a:a.next().then((function(t){return t.done?t.value:a.next()}))},P(x),l(x,u,"Generator"),l(x,a,(function(){return this})),l(x,"toString",(function(){return"[object Generator]"})),e.keys=function(t){var e=Object(t),r=[];for(var n in e)r.push(n);return r.reverse(),function t(){for(;r.length;){var n=r.pop();if(n in e)return t.value=n,t.done=!1,t}return t.done=!0,t}},e.values=T,C.prototype={constructor:C,reset:function(e){if(this.prev=0,this.next=0,this.sent=this._sent=t,this.done=!1,this.delegate=null,this.method="next",this.arg=t,this.tryEntries.forEach(_),!e)for(var r in this)"t"===r.charAt(0)&&n.call(this,r)&&!isNaN(+r.slice(1))&&(this[r]=t)},stop:function(){this.done=!0;var t=this.tryEntries[0].completion;if("throw"===t.type)throw t.arg;return this.rval},dispatchException:function(e){if(this.done)throw e;var r=this;function o(n,o){return c.type="throw",c.arg=e,r.next=n,o&&(r.method="next",r.arg=t),!!o}for(var i=this.tryEntries.length-1;i>=0;--i){var a=this.tryEntries[i],c=a.completion;if("root"===a.tryLoc)return o("end");if(a.tryLoc<=this.prev){var u=n.call(a,"catchLoc"),l=n.call(a,"finallyLoc");if(u&&l){if(this.prev<a.catchLoc)return o(a.catchLoc,!0);if(this.prev<a.finallyLoc)return o(a.finallyLoc)}else if(u){if(this.prev<a.catchLoc)return o(a.catchLoc,!0)}else{if(!l)throw Error("try statement without catch or finally");if(this.prev<a.finallyLoc)return o(a.finallyLoc)}}}},abrupt:function(t,e){for(var r=this.tryEntries.length-1;r>=0;--r){var o=this.tryEntries[r];if(o.tryLoc<=this.prev&&n.call(o,"finallyLoc")&&this.prev<o.finallyLoc){var i=o;break}}i&&("break"===t||"continue"===t)&&i.tryLoc<=e&&e<=i.finallyLoc&&(i=null);var a=i?i.completion:{};return a.type=t,a.arg=e,i?(this.method="next",this.next=i.finallyLoc,m):this.complete(a)},complete:function(t,e){if("throw"===t.type)throw t.arg;return"break"===t.type||"continue"===t.type?this.next=t.arg:"return"===t.type?(this.rval=this.arg=t.arg,this.method="return",this.next="end"):"normal"===t.type&&e&&(this.next=e),m},finish:function(t){for(var e=this.tryEntries.length-1;e>=0;--e){var r=this.tryEntries[e];if(r.finallyLoc===t)return this.complete(r.completion,r.afterLoc),_(r),m}},catch:function(t){for(var e=this.tryEntries.length-1;e>=0;--e){var r=this.tryEntries[e];if(r.tryLoc===t){var n=r.completion;if("throw"===n.type){var o=n.arg;_(r)}return o}}throw Error("illegal catch attempt")},delegateYield:function(e,r,n){return this.delegate={iterator:T(e),resultName:r,nextLoc:n},"next"===this.method&&(this.arg=t),m}},e}function O(t,e,r,n,o,i,a){try{var c=t[i](a),u=c.value}catch(t){return void r(t)}c.done?e(u):Promise.resolve(u).then(n,o)}function E(t){return function(){var e=this,r=arguments;return new Promise((function(n,o){var i=t.apply(e,r);function a(t){O(i,n,o,a,c,"next",t)}function c(t){O(i,n,o,a,c,"throw",t)}a(void 0)}))}}function j(t,e){return function(t){if(Array.isArray(t))return t}(t)||function(t,e){var r=null==t?null:"undefined"!=typeof Symbol&&t[Symbol.iterator]||t["@@iterator"];if(null!=r){var n,o,i,a,c=[],u=!0,l=!1;try{if(i=(r=r.call(t)).next,0===e){if(Object(r)!==r)return;u=!1}else for(;!(u=(n=i.call(r)).done)&&(c.push(n.value),c.length!==e);u=!0);}catch(t){l=!0,o=t}finally{try{if(!u&&null!=r.return&&(a=r.return(),Object(a)!==a))return}finally{if(l)throw o}}return c}}(t,e)||function(t,e){if(t){if("string"==typeof t)return S(t,e);var r={}.toString.call(t).slice(8,-1);return"Object"===r&&t.constructor&&(r=t.constructor.name),"Map"===r||"Set"===r?Array.from(t):"Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?S(t,e):void 0}}(t,e)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function S(t,e){(null==e||e>t.length)&&(e=t.length);for(var r=0,n=Array(e);r<e;r++)n[r]=t[r];return n}const x=function(){var t=(0,i.Zp)(),e=(0,o.useRef)(null),r=(0,o.useRef)(null),a=(0,i.g)()._id,d=j((0,o.useState)({isDraft:!0,source:null}),2),m=(d[0],d[1]),b=j((0,o.useState)({tags:[],categories:[],frontMatter:{},source:""}),2),O=b[0],S=b[1],x=j((0,o.useState)([]),2),P=(x[0],x[1]),A=j((0,o.useState)(""),2),L=A[0],k=A[1],M=j((0,o.useState)(""),2),_=M[0],C=M[1],T=j((0,o.useState)(""),2),D=(T[0],T[1]),N=j((0,o.useState)({}),2),I=(N[0],N[1]),F=j((0,o.useState)(!1),2),G=F[0],z=F[1],U=(0,s.A)(),B=j((0,o.useState)({width:"100%",height:"100%"}),2),R=B[0],V=B[1],Y=j((0,o.useState)(!0),2),Z=Y[0],$=Y[1],W="dark"===(0,o.useContext)(v.F).theme?{backgroundColor:"#333",color:"#fff"}:{backgroundColor:"#fff",color:"#000"},H=(0,y.d4)((function(t){return t.vditorToolbarPin})),X=function(t){return new Promise((function(e,r){n.eu.get("/hexopro/api/pages/"+t).then((function(t){e(t.data)})).catch((function(t){r(t)}))}))},q=function(t,e){if("pageMeta"===t)return S(e),void P(Object.keys(e.frontMatter));if("page"===t){var r=e.raw.split("---"),n=""===r[0]?2:1,o=r.slice(n).join("---").trim();C(e.title),D(o),m(e);var i=e._content;k(i)}},J=function(){var e=E(w().mark((function e(){var r;return w().wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return r=new Promise((function(t,e){n.eu.get("/hexopro/api/pages/"+a+"/remove").then((function(e){t(e.data)})).catch((function(t){e(t)}))})),e.next=3,r;case 3:t("/content/pages");case 4:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}();return(0,o.useEffect)((function(){var t=function(){if(r.current){var t=r.current,e=t.clientWidth,n=t.clientHeight;V({width:"".concat(e+20,"px"),height:"".concat(n+20,"px")})}};return t(),window.addEventListener("resize",t),function(){window.removeEventListener("resize",t)}}),[]),(0,o.useEffect)((function(){$(!0);var t=function(){var t=E(w().mark((function t(){var e,r;return w().wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return e={page:X(a),pageMeta:new Promise((function(t,e){n.eu.get("/hexopro/api/pageMeta/"+a).then((function(e){t(e.data)})).catch((function(t){e(t)}))}))},r=Object.keys(e).map((function(t){return Promise.resolve(e[t]).then((function(e){var r={};r[t]=e,I(r),q&&q(t,e)}))})),t.next=4,Promise.all(r);case 4:setTimeout((function(){$(!1)}),800);case 5:case"end":return t.stop()}}),t)})));return function(){return t.apply(this,arguments)}}();t()}),[]),(0,o.useEffect)((function(){var t=c().debounce((function(t){!function(t){new Promise((function(e,r){n.eu.post("/hexopro/api/pages/"+a,t).then((function(t){e(t.data)})).catch((function(t){r(t)}))}))}(t)}),1e3,{trailing:!0,loading:!0});e.current=t}),[]),o.createElement("div",{ref:r,style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflowY:"auto",overflowX:"hidden"}},o.createElement(h.A,{paragraph:{rows:10},loading:Z,active:!0,className:p.default.skeleton,style:g(g({},R),W)}),o.createElement(f.default,{isPage:!0,isDraft:!1,handlePublish:function(){},handleUnpublish:function(){},initTitle:_,popTitle:U["editor.header.pop.title"],popDes:U["page.editor.header.pop.des"],handleChangeTitle:function(t){t!==_&&(C(t),e.current({title:t}))},handleSettingClick:function(t){return z(!0)},handleRemoveSource:J}),o.createElement("div",{style:{width:"100%",flex:1,padding:0,border:"none"}},o.createElement(l.A,{initValue:L,isPinToolbar:H,handleChangeContent:function(t){e.current({_content:t})},handleUploadingImage:function(t){}})),o.createElement(u.PageSettings,{visible:G,setVisible:z,pageMeta:O,setPageMeta:S,handleChange:function(t){return new Promise((function(e,r){n.eu.post("/hexopro/api/pages/"+a,t).then((function(t){e(t.data)})).catch((function(t){r(t)}))}))}}))}},819:(t,e,r)=>{r.r(e),r.d(e,{PageSettings:()=>w});var n=r(6540),o=r(6945),i=r(9036),a=r(7152),c=r(6370),u=r(2702),l=r(7977),f=r(6914),s=r(1198),h=r(6789),p=r(8377);function y(t){return y="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},y(t)}function v(t,e){var r=Object.keys(t);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(t);e&&(n=n.filter((function(e){return Object.getOwnPropertyDescriptor(t,e).enumerable}))),r.push.apply(r,n)}return r}function d(t){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?v(Object(r),!0).forEach((function(e){m(t,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(r)):v(Object(r)).forEach((function(e){Object.defineProperty(t,e,Object.getOwnPropertyDescriptor(r,e))}))}return t}function m(t,e,r){return(e=function(t){var e=function(t,e){if("object"!=y(t)||!t)return t;var r=t[Symbol.toPrimitive];if(void 0!==r){var n=r.call(t,e||"default");if("object"!=y(n))return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===e?String:Number)(t)}(t,"string");return"symbol"==y(e)?e:e+""}(e))in t?Object.defineProperty(t,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):t[e]=r,t}function g(t,e){return function(t){if(Array.isArray(t))return t}(t)||function(t,e){var r=null==t?null:"undefined"!=typeof Symbol&&t[Symbol.iterator]||t["@@iterator"];if(null!=r){var n,o,i,a,c=[],u=!0,l=!1;try{if(i=(r=r.call(t)).next,0===e){if(Object(r)!==r)return;u=!1}else for(;!(u=(n=i.call(r)).done)&&(c.push(n.value),c.length!==e);u=!0);}catch(t){l=!0,o=t}finally{try{if(!u&&null!=r.return&&(a=r.return(),Object(a)!==a))return}finally{if(l)throw o}}return c}}(t,e)||function(t,e){if(t){if("string"==typeof t)return b(t,e);var r={}.toString.call(t).slice(8,-1);return"Object"===r&&t.constructor&&(r=t.constructor.name),"Map"===r||"Set"===r?Array.from(t):"Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?b(t,e):void 0}}(t,e)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function b(t,e){(null==e||e>t.length)&&(e=t.length);for(var r=0,n=Array(e);r<e;r++)n[r]=t[r];return n}function w(t){var e=t.visible,r=t.setVisible,y=t.pageMeta,v=t.setPageMeta,m=t.handleChange,b=g((0,n.useState)(!1),2),w=b[0],O=b[1],E=g((0,n.useState)([]),2),j=E[0],S=E[1];return n.createElement(o.A,{title:n.createElement("div",{style:{textAlign:"left"}},"文章属性"),visible:e,onCancel:function(){v(d(d({},y),{},{tags:[],categories:[],frontMatter:j})),r(!1)},onOk:function(){var t;t=y.source,/^([a-zA-Z0-9-_\/]+)\/([a-zA-Z0-9-_]+\.md)$/i.test(t)?(r(!1),m({frontMatter:y.frontMatter,source:y.source})):i.Ay.error("配置的页面路径非法请检查！")},afterOpenChange:function(){S(y.frontMatter)},style:{width:800}},n.createElement(a.A,{style:{marginTop:15,marginBottom:15}},n.createElement(c.A,null,n.createElement(u.A,{style:{width:"100",flexWrap:"wrap"}},Object.keys(y.frontMatter).map((function(t){return n.createElement(l.A,{key:t,title:y.frontMatter[t]?y.frontMatter[t]:"unset"},n.createElement(f.A,{closable:!0,onClose:function(){return function(t){var e={};Object.keys(y.frontMatter).forEach((function(r){r!==t&&(e[r]=y.frontMatter[r])}));var r=d(d({},y),{},{frontMatter:e});v(r)}(t)},key:t,color:"blue",style:{marginBottom:5}},t))})),n.createElement(s.Ay,{type:"dashed",onClick:function(){O(!w)}},"+自定义frontMatter")),n.createElement(p.FrontMatterAdder,{existFrontMatter:j,onClose:function(){O(!1)},visible:w,title:"Font-Matter",frontMatter:y.frontMatter,onChange:function(t){var e=d(d({},y),{},{frontMatter:t});v(e)}}))),n.createElement(a.A,{style:{marginTop:15,marginBottom:15}},n.createElement(c.A,null,n.createElement(h.A,{style:{width:350},allowClear:!0,placeholder:"请输入页面存放路径",value:y.source,onChange:function(t){var e=d(d({},y),{},{source:t});v(e)}}))))}}}]);
//# sourceMappingURL=11300a8fccadc.chunk.js.map