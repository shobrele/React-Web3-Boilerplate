import * as React from 'react'
import styled from 'styled-components'

import Web3Modal from 'web3modal'
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider'
import Column from './components/Column'
import Wrapper from './components/Wrapper'
import Header from './components/Header'
import Loader from './components/Loader'
import Button from './components/Button'
import ConnectButton from './components/ConnectButton'

import { Web3Provider } from '@ethersproject/providers'
import { getChainData } from './helpers/utilities'
import { US_ELECTION_ADDRESS } from './constants'
import { getContract } from './helpers/ethers'
import USElection from './constants/abis/USElection.json'

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`

const SLanding = styled(Column)`
  height: 600px;
`

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`

interface IAppState {
  fetching: boolean
  address: string
  library: any
  connected: boolean
  chainId: number
  pendingRequest: boolean
  result: any | null
  electionContract: any | null
  info: any | null
  currentLeader: string
  stateName: string
  votesBiden: number
  seatsBiden: number
  votesTrump: number
  seatsTrump: number
  seats: number
  transactionHash: string
  electionState: string
  errorMsg: string
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  library: null,
  connected: false,
  chainId: 1,
  pendingRequest: false,
  result: null,
  electionContract: null,
  info: null,
  currentLeader: '',
  stateName: '',
  votesBiden: 0,
  seatsBiden: 0,
  votesTrump: 0,
  seatsTrump: 0,
  seats: 0,
  transactionHash: '',
  electionState: '',
  errorMsg: '',
}

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal
  public state: IAppState
  public provider: any

  constructor(props: any) {
    super(props)
    this.state = {
      ...INITIAL_STATE,
    }

    this.handleChange = this.handleChange.bind(this)

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions(),
    })
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect()
    }
  }

  public onConnect = async () => {
    this.provider = await this.web3Modal.connect()

    const library = new Web3Provider(this.provider)

    const network = await library.getNetwork()

    const address = this.provider.selectedAddress
      ? this.provider.selectedAddress
      : this.provider.accounts[0]

    const electionContract = getContract(
      US_ELECTION_ADDRESS,
      USElection.abi,
      library,
      address,
    )

    await this.setState({
      library,
      chainId: network.chainId,
      address,
      connected: true,
      electionContract,
    })

    await this.currentLeader()

    await this.getSeats()

    await this.getElectionState()

    await this.subscribeToProviderEvents(this.provider)
  }

  public subscribeToProviderEvents = async (provider: any) => {
    if (!provider.on) {
      return
    }

    provider.on('accountsChanged', this.changedAccount)
    provider.on('networkChanged', this.networkChanged)
    provider.on('close', this.close)

    await this.web3Modal.off('accountsChanged')
  }

  public async unSubscribe(provider: any) {
    // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
    window.location.reload(false)
    if (!provider.off) {
      return
    }

    provider.off('accountsChanged', this.changedAccount)
    provider.off('networkChanged', this.networkChanged)
    provider.off('close', this.close)
  }

  public changedAccount = async (accounts: string[]) => {
    if (!accounts.length) {
      // Metamask Lock fire an empty accounts array
      await this.resetApp()
    } else {
      await this.setState({ address: accounts[0] })
    }
  }

  public networkChanged = async (networkId: number) => {
    const library = new Web3Provider(this.provider)
    const network = await library.getNetwork()
    const chainId = network.chainId
    await this.setState({ chainId, library })
  }

  public close = async () => {
    this.resetApp()
  }

  public getNetwork = () => getChainData(this.state.chainId).network

  public getProviderOptions = () => {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID,
        },
      },
    }
    return providerOptions
  }

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider()
    localStorage.removeItem('WEB3_CONNECT_CACHED_PROVIDER')
    localStorage.removeItem('walletconnect')
    await this.unSubscribe(this.provider)

    this.setState({ ...INITIAL_STATE })
  }

  public currentLeader = async () => {
    const { electionContract } = this.state

    const currentLeader = await electionContract.currentLeader()
    const currentLeaderString = currentLeader === 1 ? 'Biden' : 'Trump'

    await this.setState({ currentLeader: currentLeaderString })
  }

  public getElectionState = async () => {
    const { electionContract } = this.state

    const electionEnded = await electionContract.electionEnded()

    const electionStateString = electionEnded ? 'Ended' : 'Ongoing'

    await this.setState({ electionState: electionStateString })
  }

  public getSeats = async () => {
    const { electionContract } = this.state

    const currentSeatsBiden = await electionContract.seats(1)
    const currentSeatsTrump = await electionContract.seats(2)

    await this.setState({ seatsBiden: currentSeatsBiden })
    await this.setState({ seatsTrump: currentSeatsTrump })
  }

  public submitElectionResult = async () => {
    const { electionContract } = this.state

    await this.setState({ fetching: true })

    const dataArr = [
      this.state.stateName.toString(),
      this.state.votesBiden.toString(),
      this.state.votesTrump.toString(),
      this.state.seats.toString(),
    ]

    try {
      const transaction = await electionContract.submitStateResult(dataArr)

      await this.setState({ transactionHash: transaction.hash })

      const transactionReceipt = await transaction.wait()
      if (transactionReceipt.status === 1) {
        await this.currentLeader()
      }
    } catch {
      await this.setState({ errorMsg: 'Something went wrong' })
    }
    await this.setState({ fetching: false })
    await this.getSeats()
  }

  public endElection = async () => {
    const { electionContract } = this.state

    try {
      await electionContract.endElection()
    } catch {
      await this.setState({ errorMsg: 'Something went wrong' })
    }
    await this.getElectionState()
  }

  public handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    this.setState({ [e.target.name]: e.target.value })
  }

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching,
      stateName,
      votesBiden,
      votesTrump,
      seats,
    } = this.state
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
          />
          <SContent>
            {fetching ? (
              <Column center>
                <SContainer>
                  <Loader />
                  <Column center> Transaction in progress</Column>
                  <Column center>
                    Transaction hash: {this.state.transactionHash}
                  </Column>
                  <Column center>
                    <a
                      href={
                        'https://ropsten.etherscan.io/tx/' +
                        this.state.transactionHash
                      }
                    >
                      Etherscan
                    </a>
                  </Column>
                </SContainer>
              </Column>
            ) : (
              <SLanding center>
                {!this.state.connected && (
                  <ConnectButton onClick={this.onConnect} />
                )}
                <Column center>
                  Election State is: {this.state.electionState}
                </Column>
                <Column center>
                  Current Leader is: {this.state.currentLeader}
                </Column>
                <Column center>
                  Seats number for Biden: {this.state.seatsBiden}
                </Column>
                <Column center>
                  Seats number for Trump: {this.state.seatsTrump}
                </Column>
                <Column>
                  <input
                    name="stateName"
                    value={stateName}
                    onChange={this.handleChange}
                  />
                  <input
                    name="votesBiden"
                    value={votesBiden}
                    onChange={this.handleChange}
                  />
                  <input
                    name="votesTrump"
                    value={votesTrump}
                    onChange={this.handleChange}
                  />
                  <input
                    name="seats"
                    value={seats}
                    onChange={this.handleChange}
                  />
                </Column>
                <Column>
                  <Button onClick={this.submitElectionResult}>
                    Submit results
                  </Button>
                </Column>
                <Column center>
                  <Button onClick={this.endElection}>End Election</Button>
                </Column>
                <Column center>{this.state.errorMsg}</Column>
              </SLanding>
            )}
          </SContent>
        </Column>
      </SLayout>
    )
  }
}

export default App
