package events

type registeredEventFn[T any] struct {
	Id int
	Fn func(evt T)
}

type EventRegistry[T any] struct {
	eventFnMap   map[int]registeredEventFn[T]
	evtIdCounter int
}

func NewEventRegistry[T any]() EventRegistry[T] {
	return EventRegistry[T]{
		eventFnMap: make(map[int]registeredEventFn[T]),
	}
}

func (er *EventRegistry[T]) Register(fn func(evt T)) func() {
	evtId := er.getNextEvtId()
	regEvt := registeredEventFn[T]{
		Id: evtId,
		Fn: fn,
	}
	er.eventFnMap[evtId] = regEvt
	offCb := func() {
		delete(er.eventFnMap, evtId)
	}
	return offCb
}

func (er *EventRegistry[T]) Fire(evt T) {
	for _, regEvt := range er.eventFnMap {
		regEvt.Fn(evt)
	}
}

func (er *EventRegistry[T]) getNextEvtId() int {
	nextId := er.evtIdCounter
	er.evtIdCounter = er.evtIdCounter + 1
	return nextId
}
