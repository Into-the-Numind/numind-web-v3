// TypeScript 声明：lucide 深度导入路径
// lucide 包未提供 dist/esm/ 下子模块的类型声明，手动补充

type LucideSVGProps = Record<string, string | number | undefined>
type LucideIconNode = [tag: string, attrs: LucideSVGProps][]

declare module 'lucide/dist/esm/icons/*.js' {
  const icon: LucideIconNode
  export default icon
}

declare module 'lucide/dist/esm/replaceElement.js' {
  const replaceElement: (
    element: Element,
    options: {
      nameAttr: string
      icons: Record<string, LucideIconNode>
      attrs: Record<string, string>
    }
  ) => ChildNode | undefined
  export default replaceElement
}
