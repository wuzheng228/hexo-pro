declare module '*.svg' {
    const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
    export default content;
}

declare module '*.module.css' {
    const classes: { [className: string]: string };
    export default classes;
}

declare module '*.module.less' {
    const classes: { [className: string]: string };
    export default classes;
}

