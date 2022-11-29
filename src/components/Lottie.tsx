import { FC, useEffect } from 'react'
import lottie from 'lottie-web'

interface Props {
  data: Record<string, any>
  loop?: boolean
}

const Lottie: FC<Props> = ({ data, loop = false }) => {
  useEffect(() => {
    init()
  }, [])

  const init = () => {
    const instance = lottie.loadAnimation({
      container: document.querySelector('.lottie') as Element,
      animationData: data,
      loop,
      autoplay: true,
    })

    instance.play()
  }
  return <div className="lottie" />
}

export default Lottie
