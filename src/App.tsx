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
import { LIBRARY_ADDRESS } from './constants'
import { getContract } from './helpers/ethers'
import LibraryAbi from './constants/abis/Library.json'
import { BigNumber } from 'ethers'

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
  libraryContract: any | null
  info: any | null
  bookList: any[]
  bookName: string
  bookId:number
  bookQuantity: number
  transactionHash: string
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
  libraryContract: null,
  info: null,
  bookList: [],
  bookName: '',
  bookId:0,
  bookQuantity: 0,
  transactionHash: '',
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

    const libraryContract = getContract(
      LIBRARY_ADDRESS,
      LibraryAbi.abi,
      library,
      address,
    )

    await this.setState({
      library,
      chainId: network.chainId,
      address,
      connected: true,
      libraryContract,
    })

    await this.getAllBooks()

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

  public getAllBooks = async () => {
    const { libraryContract } = this.state

    try {
      const libraryArchive = (await libraryContract.GetLibraryArchive()) as any[]

      const mappedResult = libraryArchive.map((book) => {
        return {
          id: (book.id as BigNumber).toNumber(),
          name: book.name,
          quantity: (book.quantity as BigNumber).toNumber(),
          exists: book.exists,
        }
      })

      this.setState({ bookList: mappedResult })
    } catch {
      await this.setState({
        errorMsg: 'Something went wrong when trying to get the book list!',
      })
    }
  }

  public rentBook = async () => {
    const { libraryContract } = this.state
    await this.setState({ fetching: true })

    try {
      const transaction = await libraryContract.BorrowBook(this.state.bookId)

      await this.setState({ transactionHash: transaction.hash })

      const transactionReceipt = await transaction.wait()
      if (transactionReceipt.status === 1) {
        await this.getAllBooks()
      }
    } catch {
      await this.setState({
        errorMsg: 'Book with that id not found or already rented!',
      })
    }

    await this.setState({ fetching: false })
  }

  public addBook = async () => {
    const { libraryContract } = this.state

    await this.setState({ fetching: true })

    try {
      const transaction = await libraryContract.AddBook(
        this.state.bookName,
        this.state.bookQuantity,
      )

      await this.setState({ transactionHash: transaction.hash })

      const transactionReceipt = await transaction.wait()
      if (transactionReceipt.status === 1) {
        await this.getAllBooks()
      }
    } catch {
      await this.setState({
        errorMsg: 'Book with the same name already exists!',
      })
    }
    await this.setState({ fetching: false })
  }

  public returnBook = async () => {
    const { libraryContract } = this.state
    await this.setState({ fetching: true })

    try {
      const transaction = await libraryContract.ReturnBook(this.state.bookId)

      await this.setState({ transactionHash: transaction.hash })

      const transactionReceipt = await transaction.wait()
      if (transactionReceipt.status === 1) {
        await this.getAllBooks()
      }
    } catch {
      await this.setState({
        errorMsg: 'Book with that id not found or already returned!',
      })
    }
    await this.setState({ fetching: false })
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
      bookName,
      bookQuantity,
      bookId
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
                <Column center>Book List: </Column>
                <Wrapper>
                  <table>
                    <thead>
                      <tr>
                        <td>Id</td>
                        <td>Name</td>
                        <td>Quantity</td>
                        <td>Exists</td>
                      </tr>
                    </thead>
                    {this.state.bookList.map((book) => (
                      <tr key={book.id}>
                        <td>{book.id}</td>
                        <td>{book.name}</td>
                        <td>{book.quantity}</td>
                        <td>{book.exists.toString()}</td>
                      </tr>
                    ))}
                  </table>
                </Wrapper>
                <Wrapper>
                  <Column>
                    <input
                      name="bookName"
                      value={bookName}
                      onChange={this.handleChange}
                    />
                    <input
                      name="bookQuantity"
                      value={bookQuantity}
                      onChange={this.handleChange}
                    />
                  </Column>
                  <Column>
                    <Button onClick={this.addBook}>Add book</Button>
                  </Column>
                </Wrapper>
                <Wrapper>
                  <Column>
                    <input
                      name="bookId"
                      value={bookId}
                      onChange={this.handleChange}
                    />
                  </Column>
                  <Column center>
                    <Button onClick={this.rentBook}>Rent Book</Button>
                  </Column>
                </Wrapper>
                <Wrapper>
                  <Column>
                    <input
                      name="bookId"
                      value={bookId}
                      onChange={this.handleChange}
                    />
                  </Column>
                  <Column center>
                    <Button onClick={this.returnBook}>Return Book</Button>
                  </Column>
                </Wrapper>
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
