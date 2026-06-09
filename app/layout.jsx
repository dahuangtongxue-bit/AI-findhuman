import './globals.css';

export const metadata = {
  title: '揪出人类',
  description: '6 个选手里混着一个人类，AI 审问官轮番发问、投票揪人——也可以你本人亲自潜入',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
