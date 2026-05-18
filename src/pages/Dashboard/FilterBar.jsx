import DateRangeFilter from '../../components/shared/DateRangeFilter'

export default function FilterBar({ filter, setFilter, startDate, endDate, setStartDate, setEndDate }) {
  return (
    <DateRangeFilter
      filter={filter}
      setFilter={setFilter}
      startDate={startDate}
      endDate={endDate}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
    />
  )
}
