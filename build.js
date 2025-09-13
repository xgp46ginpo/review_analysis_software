const fs = require('fs');
const path = require('path');

// 定义源文件和目标路径
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const HTML_FILE = path.join(SRC_DIR, 'index.html');
const CSS_FILE = path.join(SRC_DIR, 'style.css');
const JS_FILE = path.join(SRC_DIR, 'script.js');
const OUTPUT_FILE = path.join(DIST_DIR, 'index.html');

try {
    console.log('开始构建...');

    // 1. 确保 dist 目录存在
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR);
        console.log('创建 dist 目录。');
    }

    // 2. 读取所有文件内容
    console.log('读取源文件...');
    let htmlContent = fs.readFileSync(HTML_FILE, 'utf8');
    const cssContent = fs.readFileSync(CSS_FILE, 'utf8');
    const jsContent = fs.readFileSync(JS_FILE, 'utf8');
    console.log('文件读取成功。');

    // 3. 将 CSS 注入 HTML
    // 找到 <link rel="stylesheet" href="style.css"> 并替换
    const cssLinkTag = /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/;
    if (cssLinkTag.test(htmlContent)) {
        htmlContent = htmlContent.replace(cssLinkTag, `<style>\n${cssContent}\n</style>`);
        console.log('CSS 已内联。');
    } else {
        console.warn('警告：在 index.html 中未找到 style.css 的链接标签。');
    }

    // 4. 将 JS 注入 HTML
    // 找到 <script src="script.js"></script> 并替换
    const jsScriptTag = /<script\s+src="script\.js"\s*><\/script>/;
    if (jsScriptTag.test(htmlContent)) {
        htmlContent = htmlContent.replace(jsScriptTag, `<script>\n${jsContent}\n</script>`);
        console.log('JavaScript 已内联。');
    } else {
        console.warn('警告：在 index.html 中未找到 script.js 的脚本标签。');
    }

    // 5. 写入最终的 HTML 文件
    fs.writeFileSync(OUTPUT_FILE, htmlContent, 'utf8');
    console.log(`构建成功！整合后的文件已保存到 ${OUTPUT_FILE}`);

} catch (error) {
    console.error('构建过程中发生错误:', error);
    process.exit(1); // 以错误码退出
}
