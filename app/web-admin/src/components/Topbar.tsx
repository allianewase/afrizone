import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useAuth } from '../auth/AuthContext'
import './Topbar.css'

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="topbar">
      <button className="iconbtn menu-btn" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" />
      </button>
      <label className="search">
        <Icon name="search" />
        <input placeholder="Search tasks, workers, payments…" aria-label="Search" />
      </label>
      <div style={{ flex: 1 }} />
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/tasks?new=1')}>
        <Icon name="plus" strokeWidth={2.4} />
        New task
      </button>
      <button className="iconbtn dot-live" aria-label="Notifications">
        <Icon name="bell" />
      </button>
      <button className="iconbtn" aria-label="Help">
        <Icon name="help" />
      </button>
      <button className="iconbtn" aria-label="Log out" onClick={logout}>
        <Icon name="logout" />
      </button>
    </div>
  )
}
