import { useState, useMemo, useCallback } from 'react'

import Description from './module/Description'
import ChainCodeVerify from './module/ChainCodeVerify'
import MnemonicVerify from './module/MnemonicVerify'
import ImportFile from './module/ImportFile'
import ExportKey, { RecoveryItemModel } from './module/ExportKey'
import Result from './module/Result'

import StepSideBar from '@/components/StepSideBar'
import StepContainer from '@/components/StepContainer'
import StepContent from '@/components/StepContent'
import { useVersion, withSelectVersion } from '@/components/SelectVersion'
import { useTranslation } from '@/i18n'

const PrivateKeyRecovery = () => {
  const { version } = useVersion()
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState<RecoveryItemModel>({
    chainCode: '',
    mnemonicList: [],
    csvJson: [],
  })

  const prev = useCallback(() => {
    setStepIndex(stepIndex - 1)
  }, [stepIndex])

  const next = useCallback(() => {
    setStepIndex(stepIndex + 1)
  }, [stepIndex])

  const setChainCode = useCallback((chainCode: string) => {
    setData({
      ...data,
      chainCode,
    })
  }, [data])

  const setMnemonic = useCallback((mnemonic: string) => {
    if (data.mnemonicList.length === 3) return
    setData({
      ...data,
      mnemonicList: [...data.mnemonicList, mnemonic],
    })
  }, [data])

  const setCsvJson = useCallback((arr: any[]) => {
    setData({
      ...data,
      csvJson: arr,
    })
  }, [data])

  const stepList = useMemo(() => {
    let defaultStepList = [
      {
        key: 'description',
        value: t('Recovery.sidebar.first'),
        render: () => <Description next={next} />,
      },
      {
        key: 'chainCodeVerify',
        value: t('Recovery.step.chaincode'),
        render: () => (
          <ChainCodeVerify next={next} prev={prev} onComplete={setChainCode} />
        ),
      },
      {
        key: 'shard1Verify',
        value: t('Recovery.step.mnemonic', { x: t('common.part1') }),
        render: () => (
          <MnemonicVerify
            key={1}
            index={1}
            list={data.mnemonicList}
            prev={prev}
            next={next}
            onComplete={setMnemonic}
          />
        ),
      },
      {
        key: 'shard2Verify',
        value: t('Recovery.step.mnemonic', { x: t('common.part2') }),
        render: () => (
          <MnemonicVerify
            key={2}
            index={2}
            list={data.mnemonicList}
            next={next}
            onComplete={setMnemonic}
          />
        ),
      },
      {
        key: 'shard3Verify',
        value: t('Recovery.step.mnemonic', { x: t('common.part3') }),
        render: () => (
          <MnemonicVerify
            key={3}
            index={3}
            list={data.mnemonicList}
            next={next}
            onComplete={setMnemonic}
          />
        ),
      },
      {
        key: 'importFile',
        value: t('Recovery.step.importFile'),
        render: () => <ImportFile next={next} onComplete={setCsvJson} />,
      },
      {
        key: 'exportKey',
        value: t('Recovery.step.exportKey'),
        render: () => <ExportKey prev={prev} next={next} data={data} />,
      },
      {
        key: 'result',
        render: () => <Result />,
      },
    ]
    if (version === 'v2') {
      defaultStepList = defaultStepList.filter(
        step => step.key !== 'chainCodeVerify'
      )
    }
    return defaultStepList
  }, [version, stepIndex, data])

  return (
    <StepContainer>
      <StepSideBar
        title={t('Recovery.sidebar.title')}
        desc={t('Recovery.sidebar.desc')}
        stepIndex={stepIndex}
        stepList={stepList}
      />
      <StepContent>{stepList[stepIndex].render()}</StepContent>
    </StepContainer>
  )
}

export default withSelectVersion(PrivateKeyRecovery)
